import { Types } from "mongoose";
import { Subscriber } from "@features/subscriber/models/subscriber.model";
import {
  SubscriberSegment,
  SegmentStatus,
} from "../../models/subscriber-segment.model";
import {
  OptimizationRound,
  OptimizationStatus,
} from "../../models/optimization-round.model";
import {
  CopywritingStyle,
  WritingStyle,
  Tone,
  Personality,
} from "../offer-selection/OfferSelectionAgent";
import { EmailOptimizationAgent } from "../reinforcement-learning/EmailOptimizationAgent";

export interface ISegmentationConfig {
  numberOfSegments: number;
  segmentSize: number;
  includeControlGroup: boolean;
  controlGroupSize: number;
  explorationRate: number; // Percentage of segments to use for exploration (0-1)
}

export class SegmentationAgent {
  private emailOptimizationAgent: EmailOptimizationAgent;

  constructor(emailOptimizationAgent?: EmailOptimizationAgent) {
    // Use the provided instance or create a new one if not provided
    this.emailOptimizationAgent =
      emailOptimizationAgent || new EmailOptimizationAgent();
  }

  /**
   * Segments subscribers for a specific optimization round
   *
   * @param subscriberIds - Array of subscriber IDs to segment
   * @param optimizationRoundId - ID of the optimization round
   * @param userId - User ID
   * @param campaignProcessId - Campaign process ID
   * @param config - Segmentation configuration
   * @returns Array of created segment IDs
   */
  public async segmentSubscribers(
    subscriberIds: string[],
    optimizationRoundId: string,
    userId: string,
    campaignProcessId: string,
    config: ISegmentationConfig
  ): Promise<string[]> {
    // Validate inputs
    if (!subscriberIds.length) {
      throw new Error("No subscribers provided for segmentation");
    }

    // Shuffle the subscribers array to ensure random distribution
    const shuffledSubscribers = this.shuffleArray([...subscriberIds]);

    // Get the optimization round to check if it's the first round
    const optimizationRound = await OptimizationRound.findById(
      optimizationRoundId
    );
    if (!optimizationRound) {
      throw new Error("Optimization round not found");
    }

    const isFirstRound = optimizationRound.roundNumber === 1;

    // Determine parameter combinations for segments
    let parameterCombinations: Array<{
      copywritingStyle: CopywritingStyle;
      writingStyle: WritingStyle;
      tone: Tone;
      personality: Personality;
    }> = [];

    if (isFirstRound) {
      // For the first round, create diverse parameter combinations to explore
      parameterCombinations = this.generateInitialParameterCombinations(
        config.numberOfSegments
      );
    } else {
      // For subsequent rounds, use the best performing parameters from previous rounds
      // and generate some exploration combinations
      parameterCombinations = await this.generateOptimizedParameterCombinations(
        optimizationRound.campaignProcessId.toString(),
        optimizationRound.roundNumber,
        config.numberOfSegments,
        config.explorationRate
      );
    }

    // Calculate segment sizes
    const segmentSize = Math.floor(
      shuffledSubscribers.length / config.numberOfSegments
    );
    const remainingSubscribers =
      shuffledSubscribers.length % config.numberOfSegments;

    // Create segments
    const segmentIds: string[] = [];
    let subscriberIndex = 0;

    // Create control group if needed
    if (config.includeControlGroup && config.controlGroupSize > 0) {
      const controlGroupSize = Math.min(
        config.controlGroupSize,
        Math.floor(shuffledSubscribers.length * 0.1) // Max 10% of subscribers
      );

      const controlGroupSubscribers = shuffledSubscribers.slice(
        0,
        controlGroupSize
      );
      subscriberIndex += controlGroupSize;

      // Use a balanced parameter combination for control group
      const controlSegment = await SubscriberSegment.create({
        userId: new Types.ObjectId(userId),
        campaignProcessId: new Types.ObjectId(campaignProcessId),
        optimizationRoundId: new Types.ObjectId(optimizationRoundId),
        segmentNumber: 0, // Control group is segment 0
        subscriberIds: controlGroupSubscribers.map(
          (id) => new Types.ObjectId(id)
        ),
        status: SegmentStatus.PENDING,
        assignedParameters: this.getBalancedParameters(),
        isControlGroup: true,
        isExplorationGroup: false,
      });

      segmentIds.push(controlSegment.id);
    }

    // Create regular segments
    for (let i = 0; i < config.numberOfSegments; i++) {
      const currentSegmentSize =
        segmentSize + (i < remainingSubscribers ? 1 : 0);
      const segmentSubscribers = shuffledSubscribers.slice(
        subscriberIndex,
        subscriberIndex + currentSegmentSize
      );
      subscriberIndex += currentSegmentSize;

      if (segmentSubscribers.length === 0) {
        continue; // Skip empty segments
      }

      // Determine if this is an exploration group
      const isExplorationGroup =
        i >= config.numberOfSegments * (1 - config.explorationRate);

      const segment = await SubscriberSegment.create({
        userId: new Types.ObjectId(userId),
        campaignProcessId: new Types.ObjectId(campaignProcessId),
        optimizationRoundId: new Types.ObjectId(optimizationRoundId),
        segmentNumber: i + 1, // Start from 1 (0 is control group)
        subscriberIds: segmentSubscribers.map((id) => new Types.ObjectId(id)),
        status: SegmentStatus.PENDING,
        assignedParameters:
          parameterCombinations[i % parameterCombinations.length],
        isControlGroup: false,
        isExplorationGroup,
      });

      segmentIds.push(segment.id);
    }

    // Update optimization round with segment count
    await OptimizationRound.findByIdAndUpdate(optimizationRoundId, {
      status: OptimizationStatus.IN_PROGRESS,
    });

    return segmentIds;
  }

  /**
   * Generates diverse parameter combinations for the initial round
   *
   * @param count - Number of combinations to generate
   * @returns Array of parameter combinations
   */
  private generateInitialParameterCombinations(count: number): Array<{
    copywritingStyle: CopywritingStyle;
    writingStyle: WritingStyle;
    tone: Tone;
    personality: Personality;
  }> {
    const copywritingStyles: CopywritingStyle[] = [
      "AIDA",
      "PAS",
      "BAB",
      "PPP",
      "FAB",
      "QUEST",
    ];
    const writingStyles: WritingStyle[] = [
      "descriptive",
      "narrative",
      "persuasive",
      "expository",
      "conversational",
      "direct",
    ];
    const tones: Tone[] = [
      "professional",
      "friendly",
      "enthusiastic",
      "urgent",
      "empathetic",
      "authoritative",
      "casual",
    ];
    const personalities: Personality[] = [
      "confident",
      "humorous",
      "analytical",
      "caring",
      "adventurous",
      "innovative",
      "trustworthy",
    ];

    const combinations: Array<{
      copywritingStyle: CopywritingStyle;
      writingStyle: WritingStyle;
      tone: Tone;
      personality: Personality;
    }> = [];

    // Generate diverse combinations
    for (let i = 0; i < count; i++) {
      combinations.push({
        copywritingStyle: copywritingStyles[i % copywritingStyles.length],
        writingStyle: writingStyles[(i * 2) % writingStyles.length],
        tone: tones[(i * 3) % tones.length],
        personality: personalities[(i * 5) % personalities.length],
      });
    }

    return combinations;
  }

  /**
   * Generates parameter combinations based on previous round performance
   * and neural network predictions
   *
   * @param campaignProcessId - Campaign process ID
   * @param currentRoundNumber - Current round number
   * @param count - Number of combinations to generate
   * @param explorationRate - Rate of exploration vs exploitation
   * @returns Array of parameter combinations
   */
  private async generateOptimizedParameterCombinations(
    campaignProcessId: string,
    currentRoundNumber: number,
    count: number,
    explorationRate: number
  ): Promise<
    Array<{
      copywritingStyle: CopywritingStyle;
      writingStyle: WritingStyle;
      tone: Tone;
      personality: Personality;
    }>
  > {
    console.log(
      `Generating optimized parameter combinations for round ${currentRoundNumber}`
    );
    // Get previous rounds
    const previousRounds = await OptimizationRound.find({
      campaignProcessId: new Types.ObjectId(campaignProcessId),
      roundNumber: { $lt: currentRoundNumber },
    }).sort({ roundNumber: -1 });

    if (!previousRounds.length) {
      // Fallback to initial combinations if no previous rounds
      console.log(
        `No previous rounds found, using initial parameter combinations`
      );
      return this.generateInitialParameterCombinations(count);
    }

    // Get the best performing parameters from previous rounds
    const bestParameters = previousRounds
      .filter((round) => round.bestPerformingParameters)
      .map((round) => round.bestPerformingParameters!);

    // If no best parameters found, fallback to initial combinations
    if (!bestParameters.length) {
      return this.generateInitialParameterCombinations(count);
    }

    // Calculate exploitation vs exploration counts
    const exploitationCount = Math.floor(count * (1 - explorationRate));
    const explorationCount = count - exploitationCount;

    const combinations: Array<{
      copywritingStyle: CopywritingStyle;
      writingStyle: WritingStyle;
      tone: Tone;
      personality: Personality;
    }> = [];

    // Generate potential parameter combinations for prediction
    const copywritingStyles: CopywritingStyle[] = [
      "AIDA",
      "PAS",
      "BAB",
      "PPP",
      "FAB",
      "QUEST",
    ];
    const writingStyles: WritingStyle[] = [
      "descriptive",
      "narrative",
      "persuasive",
      "expository",
      "conversational",
      "direct",
    ];
    const tones: Tone[] = [
      "professional",
      "friendly",
      "enthusiastic",
      "urgent",
      "empathetic",
      "authoritative",
      "casual",
    ];
    const personalities: Personality[] = [
      "confident",
      "humorous",
      "analytical",
      "caring",
      "adventurous",
      "innovative",
      "trustworthy",
    ];

    // Generate a larger set of possible combinations for prediction
    const possibleCombinations: Array<{
      copywritingStyle: CopywritingStyle;
      writingStyle: WritingStyle;
      tone: Tone;
      personality: Personality;
      predictedConversionRate: number;
    }> = [];

    // Use the best parameters from previous rounds and some variations
    for (const bestParam of bestParameters) {
      // Add the exact best parameter
      possibleCombinations.push({
        ...bestParam,
        predictedConversionRate: 0, // Will be filled in later
      });

      // Add variations by changing one parameter at a time
      for (const style of copywritingStyles) {
        if (style !== bestParam.copywritingStyle) {
          possibleCombinations.push({
            ...bestParam,
            copywritingStyle: style,
            predictedConversionRate: 0,
          });
        }
      }

      for (const style of writingStyles) {
        if (style !== bestParam.writingStyle) {
          possibleCombinations.push({
            ...bestParam,
            writingStyle: style,
            predictedConversionRate: 0,
          });
        }
      }

      for (const tone of tones) {
        if (tone !== bestParam.tone) {
          possibleCombinations.push({
            ...bestParam,
            tone,
            predictedConversionRate: 0,
          });
        }
      }

      for (const personality of personalities) {
        if (personality !== bestParam.personality) {
          possibleCombinations.push({
            ...bestParam,
            personality,
            predictedConversionRate: 0,
          });
        }
      }
    }

    // Add some random combinations for diversity
    for (let i = 0; i < 20; i++) {
      possibleCombinations.push({
        copywritingStyle:
          copywritingStyles[
            Math.floor(Math.random() * copywritingStyles.length)
          ],
        writingStyle:
          writingStyles[Math.floor(Math.random() * writingStyles.length)],
        tone: tones[Math.floor(Math.random() * tones.length)],
        personality:
          personalities[Math.floor(Math.random() * personalities.length)],
        predictedConversionRate: 0,
      });
    }

    // Predict conversion rates for all possible combinations
    console.log(
      `Predicting conversion rates for ${possibleCombinations.length} possible parameter combinations`
    );
    for (const combination of possibleCombinations) {
      console.log(
        `Predicting conversion rate for ${combination.copywritingStyle}/${combination.writingStyle}/${combination.tone}/${combination.personality}`
      );
      combination.predictedConversionRate =
        this.emailOptimizationAgent.predictConversionRate({
          copywritingStyle: combination.copywritingStyle,
          writingStyle: combination.writingStyle,
          tone: combination.tone,
          personality: combination.personality,
        });
    }

    // Sort by predicted conversion rate
    possibleCombinations.sort(
      (a, b) => b.predictedConversionRate - a.predictedConversionRate
    );

    // Add exploitation combinations (best predicted performing)
    for (let i = 0; i < exploitationCount; i++) {
      if (i < possibleCombinations.length) {
        combinations.push({
          copywritingStyle: possibleCombinations[i].copywritingStyle,
          writingStyle: possibleCombinations[i].writingStyle,
          tone: possibleCombinations[i].tone,
          personality: possibleCombinations[i].personality,
        });
      } else {
        // If we need more combinations than we have predictions,
        // use the best parameters from previous rounds
        const index = i % bestParameters.length;
        combinations.push({
          copywritingStyle: bestParameters[index].copywritingStyle,
          writingStyle: bestParameters[index].writingStyle,
          tone: bestParameters[index].tone,
          personality: bestParameters[index].personality,
        });
      }
    }

    // Add exploration combinations (random variations)
    const initialCombinations =
      this.generateInitialParameterCombinations(explorationCount);
    combinations.push(...initialCombinations);

    return combinations;
  }

  /**
   * Returns a balanced set of parameters for control groups
   */
  private getBalancedParameters(): {
    copywritingStyle: CopywritingStyle;
    writingStyle: WritingStyle;
    tone: Tone;
    personality: Personality;
  } {
    return {
      copywritingStyle: "AIDA",
      writingStyle: "conversational",
      tone: "professional",
      personality: "confident",
    };
  }

  /**
   * Shuffles an array using Fisher-Yates algorithm
   *
   * @param array - Array to shuffle
   * @returns Shuffled array
   */
  private shuffleArray<T>(array: T[]): T[] {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }
}
