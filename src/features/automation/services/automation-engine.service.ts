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
    const automations = await Automation.find({
      isEnabled: true,
      "trigger.type": eventType,
    });

    if (automations.length === 0) {
      return;
    }

    logger.info(
      `AutomationEngine: Executing ${automations.length} automation(s) for event ${eventType}`
    );

    for (const automation of automations) {
      await this.executeAutomation(automation, payload);
    }
  }

  private async executeAutomation(
    automation: IAutomation,
    payload: any
  ): Promise<void> {
    if (!automation.nodes || automation.nodes.length === 0) {
      logger.warn(`Automation [${automation.name}] has no nodes to execute.`);
      return;
    }

    // Find the starting node.
    // This assumes the first node connected to the trigger is the start.
    // A more robust solution might store a dedicated `startNodeId`.
    const triggerId = automation.trigger.id;
    const startNode = (automation.editorData as any)?.steps?.find(
      (step: any) => step.parentId === triggerId
    );

    if (!startNode) {
      logger.error(
        `Automation [${automation.name}] has no start node defined.`
      );
      return;
    }

    let currentNodeId: string | undefined = startNode.id;
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

      const nextNodeId = await this.executeNode(
        currentNode,
        payload,
        automation
      );
      currentNodeId = nextNodeId;
    }
  }

  private async executeNode(
    node: IWorkflowNode,
    payload: any,
    automation: IAutomation
  ): Promise<string | undefined> {
    logger.info(
      `AutomationEngine: [${automation.name}] executing node ${node.type} (${node.label})`,
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
        // In a real implementation, this would trigger an email service or a scheduler.
        return node.next;

      case "CONDITION":
        // This is a placeholder for real condition evaluation.
        // For now, we'll just log and follow the 'true' branch for demonstration.
        const result = true; // Placeholder
        logger.info(
          `AutomationEngine: [${
            automation.name
          }] condition evaluated to ${result.toString()}`
        );
        return node.branches?.[result.toString() as "true" | "false"];

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

      const provider = await SmtpService.getAdminProvider();
      if (!provider) {
        throw new Error(`No admin SMTP provider configured.`);
      }

      await SmtpService.sendEmail({
        providerId: provider.id,
        to: subscriber.email,
        subject,
        html: htmlContent,
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
