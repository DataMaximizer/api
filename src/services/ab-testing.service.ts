import {
	AbTest,
	TestStatus,
	TestType,
	IAbTest,
} from "../models/ab-testing.model";
import { Campaign } from "../models/campaign.model";
import { logger } from "../config/logger";

interface TestResult {
	variantId: string;
	confidence: number;
	improvement: number;
	isWinner: boolean;
}

export class AbTestingService {
	static async createTest(testData: Partial<IAbTest>): Promise<IAbTest> {
		try {
			const campaign = await Campaign.findById(testData.campaignId);
			if (!campaign) {
				throw new Error("Campaign not found");
			}

			const test = await AbTest.create({
				...testData,
				status: TestStatus.DRAFT,
				metrics: { totalParticipants: 0 },
			});

			return test;
		} catch (error) {
			logger.error("Error creating A/B test:", error);
			throw error;
		}
	}

	static async startTest(testId: string): Promise<IAbTest> {
		try {
			const test = await AbTest.findById(testId);
			if (!test) throw new Error("Test not found");

			if (test.variants.length < 2) {
				throw new Error("Test requires at least 2 variants");
			}

			test.status = TestStatus.RUNNING;
			await test.save();

			return test;
		} catch (error) {
			logger.error("Error starting A/B test:", error);
			throw error;
		}
	}

	static async trackConversion(
		testId: string,
		variantId: string,
		metrics: {
			opens?: number;
			clicks?: number;
			conversions?: number;
			revenue?: number;
		},
	): Promise<void> {
		try {
			const test = await AbTest.findById(testId);
			if (!test) throw new Error("Test not found");

			const variant = test.variants.id(variantId);
			if (!variant) throw new Error("Variant not found");

			// Update variant metrics
			Object.entries(metrics).forEach(([key, value]) => {
				if (value && variant.metrics[key] !== undefined) {
					variant.metrics[key] += value;
				}
			});

			await test.save();

			// Check if test should be concluded
			await this.checkTestCompletion(test);
		} catch (error) {
			logger.error("Error tracking conversion:", error);
			throw error;
		}
	}

	private static async checkTestCompletion(test: IAbTest): Promise<void> {
		try {
			if (test.status !== TestStatus.RUNNING) return;

			const totalParticipants = test.variants.reduce(
				(sum, variant) => sum + variant.metrics.sent,
				0,
			);

			// Check if minimum sample size is reached
			if (totalParticipants < test.winningCriteria.minSampleSize) return;

			const results = this.calculateTestResults(test);
			const winner = results.find((result) => result.isWinner);

			if (winner && winner.confidence >= test.winningCriteria.minConfidence) {
				test.status = TestStatus.COMPLETED;
				test.winningVariantId = winner.variantId;
				test.metrics.confidence = winner.confidence;
				test.metrics.completionDate = new Date();
				await test.save();
			}
		} catch (error) {
			logger.error("Error checking test completion:", error);
			throw error;
		}
	}

	private static calculateTestResults(test: IAbTest): TestResult[] {
		const results: TestResult[] = [];
		const baselineVariant = test.variants[0];
		const baselineRate = this.getConversionRate(
			baselineVariant,
			test.winningCriteria.metric,
		);

		for (const variant of test.variants) {
			const variantRate = this.getConversionRate(
				variant,
				test.winningCriteria.metric,
			);
			const { confidence, improvement } = this.calculateStatistics(
				baselineVariant,
				variant,
				test.winningCriteria.metric,
			);

			results.push({
				variantId: variant._id,
				confidence,
				improvement,
				isWinner:
					variantRate > baselineRate &&
					confidence >= test.winningCriteria.minConfidence,
			});
		}

		return results;
	}

	private static getConversionRate(variant: any, metric: string): number {
		switch (metric) {
			case "opens":
				return variant.metrics.opens / variant.metrics.sent;
			case "clicks":
				return variant.metrics.clicks / variant.metrics.opens;
			case "conversions":
				return variant.metrics.conversions / variant.metrics.clicks;
			case "revenue":
				return variant.metrics.revenue / variant.metrics.conversions;
			default:
				return 0;
		}
	}

	private static calculateStatistics(
		control: any,
		variant: any,
		metric: string,
	): { confidence: number; improvement: number } {
		const controlRate = this.getConversionRate(control, metric);
		const variantRate = this.getConversionRate(variant, metric);

		// Calculate Z-score
		const controlSE = Math.sqrt(
			(controlRate * (1 - controlRate)) / control.metrics.sent,
		);
		const variantSE = Math.sqrt(
			(variantRate * (1 - variantRate)) / variant.metrics.sent,
		);
		const pooledSE = Math.sqrt(Math.pow(controlSE, 2) + Math.pow(variantSE, 2));
		const zScore = (variantRate - controlRate) / pooledSE;

		// Calculate confidence
		const confidence = this.normalCDF(zScore) * 100;

		// Calculate relative improvement
		const improvement = ((variantRate - controlRate) / controlRate) * 100;

		return { confidence, improvement };
	}

	private static normalCDF(x: number): number {
		const t = 1 / (1 + 0.2316419 * Math.abs(x));
		const d = 0.3989423 * Math.exp((-x * x) / 2);
		const probability =
			d *
			t *
			(0.3193815 +
				t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
		return x > 0 ? 1 - probability : probability;
	}

	static async getTestResults(testId: string): Promise<any> {
		try {
			const test = await AbTest.findById(testId);
			if (!test) throw new Error("Test not found");

			const results = this.calculateTestResults(test);

			return {
				testId: test._id,
				status: test.status,
				totalParticipants: test.metrics.totalParticipants,
				winningVariantId: test.winningVariantId,
				confidence: test.metrics.confidence,
				variants: results,
			};
		} catch (error) {
			logger.error("Error getting test results:", error);
			throw error;
		}
	}

	static async pauseTest(testId: string): Promise<IAbTest> {
		try {
			const test = await AbTest.findByIdAndUpdate(
				testId,
				{ status: TestStatus.PAUSED },
				{ new: true },
			);

			if (!test) throw new Error("Test not found");
			return test;
		} catch (error) {
			logger.error("Error pausing test:", error);
			throw error;
		}
	}
}
