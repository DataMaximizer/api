import { ContentFramework } from "../models/ai-content.model";

export class HTMLFormatterService {
	static formatContentToHTML(
		content: string,
		framework: ContentFramework,
	): string {
		content = content.trim();

		if (!content.includes('class="email-content"')) {
			content = `<div class="email-content">${content}</div>`;
		}

		content = this.addFrameworkClasses(content, framework);

		return `
            <div class="email-wrapper">
                ${content}
            </div>
        `.trim();
	}

	private static addFrameworkClasses(
		content: string,
		framework: ContentFramework,
	): string {
		switch (framework) {
			case ContentFramework.AIDA:
				return this.formatAIDA(content);
			case ContentFramework.PAS:
				return this.formatPAS(content);
			case ContentFramework.FEATURES_BENEFITS:
				return this.formatFeaturesBenefits(content);
			default:
				return content;
		}
	}

	private static formatPAS(content: string): string {
		return content.replace(
			/<div class="email-section">(.*?)<\/div>/s,
			`<div class="email-section pas-framework">
                <div class="problem-section">$1</div>
                <div class="agitate-section">$2</div>
                <div class="solution-section">$3</div>
            </div>`,
		);
	}

	private static formatAIDA(content: string): string {
		return content.replace(
			/<div class="email-section">(.*?)<\/div>/s,
			`<div class="email-section aida-framework">
                <div class="attention-section">$1</div>
                <div class="interest-section">$2</div>
                <div class="desire-section">$3</div>
                <div class="action-section">$4</div>
            </div>`,
		);
	}

	private static formatFeaturesBenefits(content: string): string {
		return content.replace(
			/<div class="email-section">(.*?)<\/div>/s,
			`<div class="email-section features-benefits-framework">
                <div class="features-section">$1</div>
                <div class="benefits-section">$2</div>
            </div>`,
		);
	}
}

