import { ITemplateBlock, ITemplateGlobalStyles } from "./email-template.model";

// A very basic and extensible renderer.
// In a real-world app, this would be much more robust,
// probably using a library like Handlebars or MJML for email-safe HTML.
export class TemplateRenderService {
  static render(
    blocks: ITemplateBlock[],
    globalStyles: ITemplateGlobalStyles,
    shouldSanitize: boolean = true
  ): string {
    const bodyStyles = `
      font-family: ${globalStyles.typography.fontFamily};
      font-size: ${globalStyles.typography.fontSize};
      line-height: ${globalStyles.typography.lineHeight};
      color: ${globalStyles.colors.text};
      background-color: ${globalStyles.colors.background};
      padding: ${globalStyles.spacing.padding};
      margin: 0;
    `;

    const blockHtml = blocks
      .map((block) => this.renderBlock(block, shouldSanitize))
      .join(
        `<div style="height: ${globalStyles.spacing.blockSpacing};"></div>`
      );

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            a { color: ${globalStyles.colors.link}; }
          </style>
        </head>
        <body style="${bodyStyles.trim()}">
          ${blockHtml}
        </body>
      </html>
    `;
  }

  private static renderBlock(
    block: ITemplateBlock,
    shouldSanitize: boolean = true
  ): string {
    switch (block.type) {
      case "header":
        return `<h1 style="${this.getStyles(block.styles)}">${
          shouldSanitize
            ? this.sanitize(block.content.text)
            : block.content.text
        }</h1>`;
      case "text":
        return `<p style="${this.getStyles(block.styles)}">${
          shouldSanitize
            ? this.sanitize(block.content.text)
            : block.content.text
        }</p>`;
      case "button":
        return `
          <a href="${
            shouldSanitize
              ? this.sanitize(block.content.url)
              : block.content.url
          }" style="${this.getStyles(block.styles)}">
            ${
              shouldSanitize
                ? this.sanitize(block.content.text)
                : block.content.text
            }
          </a>
        `;
      case "image":
        return `<img src="${
          shouldSanitize ? this.sanitize(block.content.src) : block.content.src
        }" alt="${
          shouldSanitize ? this.sanitize(block.content.alt) : block.content.alt
        }" style="max-width: 100%; ${this.getStyles(block.styles)}" />`;
      case "divider":
        return `<hr style="${this.getStyles(block.styles)}" />`;
      case "footer":
        return `<p style="font-size: 0.8em; color: #888; ${this.getStyles(
          block.styles
        )}">${
          shouldSanitize
            ? this.sanitize(block.content.text)
            : block.content.text
        }</p>`;
      default:
        return "";
    }
  }

  private static getStyles(styles: Record<string, any>): string {
    return Object.entries(styles)
      .map(([key, value]) => `${this.kebabCase(key)}: ${value};`)
      .join(" ");
  }

  private static kebabCase(str: string): string {
    return str.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
  }

  private static sanitize(text: string): string {
    if (!text) return "";
    const map: { [key: string]: string } = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return text.replace(/[&<>"']/g, (m) => map[m]);
  }
}
