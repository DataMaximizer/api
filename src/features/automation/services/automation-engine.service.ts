import { EventType, eventBus } from "@core/events/event-bus";
import {
  Automation,
  IAutomation,
  IWorkflowNode,
} from "../models/automation.model";
import { logger } from "@config/logger";
import { SmtpService } from "@features/email/smtp/smtp.service";
import { Subscriber } from "@features/subscriber/models/subscriber.model";
import { EmailTemplate } from "@features/email/templates/email-template.model";
import { TemplateRenderService } from "@features/email/templates/template-render.service";
import { AutomationLogService } from "./automation-log.service";
import { Types } from "mongoose";
import { IAutomationExecution } from "../models/automation-execution.model";
import { workflowSchedulerService } from "./workflow-scheduler.service";
import { Click } from "@features/tracking/models/click.model";
import { User, IUser } from "@features/user/models/user.model";
import { EmailTemplateService } from "@features/email/templates/email-template.service";

interface IEditorStep {
  id: string;
  type: string;
  parentId?: string;
}

const API_BASE_URL = process.env.API_BASE_URL || "http://localhost:5000";

/**
 * AutomationEngine wires domain events to user-defined automations. When an
 * event is fired we look up all enabled automations that contain a matching
 * trigger and sequentially run their actions.
 */
export class AutomationEngine {
  private static instance: AutomationEngine;

  private constructor() {}

  public static getInstance(): AutomationEngine {
    if (!AutomationEngine.instance) {
      AutomationEngine.instance = new AutomationEngine();
    }
    return AutomationEngine.instance;
  }

  /**
   * Must be called once on application bootstrap so listeners are registered.
   */
  public initialize(): void {
    logger.info("AutomationEngine initialized – listening for events");

    eventBus.onEvent(EventType.NEW_LEAD, (payload) => {
      this.processEvent(EventType.NEW_LEAD, payload).catch((err) =>
        logger.error("AutomationEngine error processing NEW_LEAD", err)
      );
    });

    eventBus.onEvent(EventType.CLICK, (payload) => {
      this.processEvent(EventType.CLICK, payload).catch((err) =>
        logger.error("AutomationEngine error processing CLICK", err)
      );
    });
  }

  private async processEvent(
    eventType: EventType,
    payload: any
  ): Promise<void> {
    const query: any = {
      isEnabled: true,
      "trigger.type": eventType,
    };

    // For new leads, we must scope the query to the correct user
    if (eventType === EventType.NEW_LEAD && payload.userId) {
      query.userId = payload.userId;
    }

    const automations = await Automation.find(query);

    if (automations.length === 0) {
      return;
    }

    const filteredAutomations = automations.filter((automation) => {
      if (eventType === EventType.NEW_LEAD) {
        const triggerListId = (automation.trigger.params as any)?.listId;
        // If the trigger specifies a list, the payload must include it.
        if (triggerListId) {
          return payload.lists?.includes(triggerListId);
        }
      }
      // For other event types or if no listId is specified, run the automation.
      return true;
    });

    logger.info(
      `AutomationEngine: Executing ${filteredAutomations.length} automation(s) for event ${eventType}`
    );

    for (const automation of filteredAutomations) {
      await this.executeAutomation(automation, payload);
    }
  }

  public async resumeAutomation(
    execution: IAutomationExecution
  ): Promise<void> {
    const automation = await Automation.findById(execution.automationId);
    if (!automation) {
      throw new Error(
        `Automation ${execution.automationId} not found for resumed execution.`
      );
    }
    await this.runWorkflow(
      automation,
      execution.subscriberId.toString(),
      execution.currentNodeId
    );
  }

  private async executeAutomation(
    automation: IAutomation,
    payload: any
  ): Promise<void> {
    const startNode = this.findStartNode(automation);
    if (!startNode) {
      logger.error(
        `Automation [${automation.name}] has no start node defined.`
      );
      return;
    }
    await this.runWorkflow(automation, payload.subscriberId, startNode.id);
  }

  private async runWorkflow(
    automation: IAutomation,
    subscriberId: string,
    startNodeId: string
  ) {
    let currentNodeId: string | undefined = startNodeId;
    while (currentNodeId) {
      const currentNode = automation.nodes.find(
        (node) => node.id === currentNodeId
      );
      if (!currentNode) {
        logger.error(
          `Automation [${automation.name}]: Node with id ${currentNodeId} not found.`
        );
        break;
      }

      const payload = { subscriberId }; // Ensure payload is consistent
      const result = await this.executeNode(currentNode, payload, automation);

      // if result is null, it means the workflow has been paused by a delay
      if (result === null) {
        break;
      }
      currentNodeId = result;
    }
  }

  private findStartNode(automation: IAutomation): IEditorStep | undefined {
    if (!automation.nodes || automation.nodes.length === 0) {
      logger.warn(`Automation [${automation.name}] has no nodes to execute.`);
      return undefined;
    }
    const triggerId = automation.trigger.id;
    return (automation.editorData as any)?.steps?.find(
      (step: any) => step.parentId === triggerId
    );
  }

  private async executeNode(
    node: IWorkflowNode,
    payload: any,
    automation: IAutomation
  ): Promise<(string | undefined) | null> {
    logger.info(
      `AutomationEngine: [${automation.name}] executing node ${node.type} (${node.label}) for subscriber ${payload.subscriberId}`,
      {
        params: node.params,
        payload,
      }
    );

    switch (node.type) {
      case "EMAIL":
        await this.handleEmailNode(node, payload, automation);
        return node.next;

      case "DELAY":
        if (node.next) {
          await workflowSchedulerService.schedule(
            automation.id,
            payload.subscriberId,
            node.next,
            node.params
          );
        }
        return null; // Pause execution

      case "END":
        logger.info(`AutomationEngine: [${automation.name}] reached end node.`);
        return undefined;

      default:
        logger.warn(
          `AutomationEngine: [${automation.name}] unknown node type ${node.type}`
        );
        return node.next;
    }
  }

  private async handleEmailNode(
    node: IWorkflowNode,
    payload: any,
    automation: IAutomation
  ): Promise<void> {
    const { selectedTemplate, content, subject, selectedSender } = node.params;
    let htmlContent = content;

    const logInput = {
      params: node.params,
      payload,
    };

    try {
      if (selectedTemplate && selectedTemplate !== "no-template") {
        const template = await EmailTemplate.findById(selectedTemplate).lean();
        if (template) {
          htmlContent = TemplateRenderService.render(
            template.blocks,
            template.globalStyles
          );
        }
      }

      const subscriber = await Subscriber.findById(payload.subscriberId).lean();
      if (!subscriber) {
        throw new Error(`Subscriber ${payload.subscriberId} not found.`);
      }

      // Fetch user profile to get unsubscribe details
      const user = (await User.findById(automation.userId).lean()) as IUser;
      if (!user || !user.address) {
        throw new Error(
          `User profile or address for ${automation.userId} not found.`
        );
      }

      const click = await Click.create({
        subscriberId: subscriber._id,
        automationId: automation._id,
        nodeId: node.id,
      });

      let finalHtml = htmlContent;

      // Use existing tracking service. Pass an empty string for campaignId.
      finalHtml = EmailTemplateService.addTrackingToTemplate(
        finalHtml,
        subscriber._id.toString(),
        "", // campaignId
        click.id
      );

      // Add unsubscribe footer
      finalHtml = EmailTemplateService.addUnsubscribeToTemplate(
        finalHtml,
        click.id,
        user.companyUrl || "",
        user.address,
        user.companyName
      );

      const provider = await SmtpService.getAdminProvider();
      if (!provider) {
        throw new Error(`No admin SMTP provider configured.`);
      }

      await SmtpService.sendEmail({
        providerId: provider.id,
        to: subscriber.email,
        subject,
        html: finalHtml,
        senderEmail: selectedSender,
      });

      const successMsg = `Successfully sent email to ${subscriber.email}`;
      logger.info(`Automation [${automation.name}]: ${successMsg}`);

      await AutomationLogService.logAction({
        automationId: new Types.ObjectId(automation.id),
        nodeId: node.id,
        subscriberId: new Types.ObjectId(payload.subscriberId),
        status: "success",
        input: logInput,
        output: { message: successMsg },
      });
    } catch (error: any) {
      const errorMsg = error.message || "Failed to execute EMAIL node.";
      logger.error(`Automation [${automation.name}]: ${errorMsg}`, error);

      if (payload.subscriberId) {
        await AutomationLogService.logAction({
          automationId: new Types.ObjectId(automation.id),
          nodeId: node.id,
          subscriberId: new Types.ObjectId(payload.subscriberId),
          status: "failure",
          input: logInput,
          output: { error: errorMsg },
        });
      }
    }
  }
}

export const automationEngine = AutomationEngine.getInstance();
