/// <reference path="./types/turndown-plugin-gfm.d.ts" />

import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

const REMOVED_NODE_NAMES = new Set(["STYLE", "SCRIPT", "NOSCRIPT", "SVG", "TEMPLATE"]);
const PRE_LANGUAGE_PATTERNS = [/\blanguage-([a-z0-9_+-]+)\b/i, /\blang-([a-z0-9_+-]+)\b/i];
const PLATFORM_NOISE_CLASSNAMES = new Set([
  "code-block-extension-header",
  "code-block-extension-copyCodeBtn",
  "highlight-tools",
]);
const COMMENT_ONLY_PATTERN = /^(?:\s*<!--[\s\S]*?-->\s*)+$/;

function normalizeInput(input: unknown): string {
  if (typeof input === "string") {
    return input;
  }

  if (input === null || input === undefined) {
    return "";
  }

  return String(input);
}

function normalizeLineEndings(value: string): string {
  return value.replace(/\r\n?/g, "\n");
}

function normalizeOutput(markdown: string): string {
  return normalizeLineEndings(markdown).trim();
}

function isRemovedNodeName(nodeName: string): boolean {
  return REMOVED_NODE_NAMES.has(nodeName.toUpperCase());
}

function hasNoiseClass(node: Node): boolean {
  if (!("classList" in node) || !node.classList) {
    return false;
  }

  const classList = node.classList as DOMTokenList;
  return Array.from(classList).some((className) => PLATFORM_NOISE_CLASSNAMES.has(className));
}

function shouldRemoveNode(node: Node): boolean {
  return isRemovedNodeName(node.nodeName) || hasNoiseClass(node);
}

function serializeNode(node: ChildNode): string {
  if ("outerHTML" in node && typeof node.outerHTML === "string") {
    return node.outerHTML;
  }

  return node.textContent ?? "";
}

function normalizeCodeBlockContent(code: string): string {
  const lines = normalizeLineEndings(code).split("\n");

  while (lines.length > 0 && lines[0].trim() === "") {
    lines.shift();
  }

  while (lines.length > 0 && lines[lines.length - 1].trim() === "") {
    lines.pop();
  }

  return lines.join("\n");
}

function buildFencedCodeBlock(code: string, language: string): string {
  const trimmedCode = normalizeCodeBlockContent(code);
  const fence = "```";

  return `\n\n${fence}${language}\n${trimmedCode}\n${fence}\n\n`;
}

function detectLanguageFromElement(element: Element | null): string {
  if (!element) {
    return "";
  }

  const dataLanguage = element.getAttribute("data-language")?.trim();
  if (dataLanguage) {
    return dataLanguage.toLowerCase();
  }

  const dataLang = element.getAttribute("data-lang")?.trim();
  if (dataLang) {
    return dataLang.toLowerCase();
  }

  const className = element.getAttribute("class") ?? "";
  for (const pattern of PRE_LANGUAGE_PATTERNS) {
    const match = className.match(pattern);
    if (match?.[1]) {
      return match[1].toLowerCase();
    }
  }

  return "";
}

function stripNoiseSubtrees(root: Element): void {
  root.querySelectorAll("*").forEach((child) => {
    if (shouldRemoveNode(child)) {
      child.remove();
    }
  });
}

function extractPreContent(element: Element): { code: string; language: string } {
  const clone = element.cloneNode(true) as Element;
  stripNoiseSubtrees(clone);

  const codeElement = clone.querySelector("code");
  const language = detectLanguageFromElement(codeElement) || detectLanguageFromElement(clone);
  const code = codeElement?.textContent ?? clone.textContent ?? "";

  return {
    code,
    language,
  };
}

function renderDetailsContent(summaryText: string, detailsBody: string): string {
  if (summaryText !== "" && detailsBody !== "") {
    return `\n\n**${summaryText}**\n\n${detailsBody}\n\n`;
  }

  if (summaryText !== "") {
    return `\n\n**${summaryText}**\n\n`;
  }

  if (detailsBody !== "") {
    return `\n\n${detailsBody}\n\n`;
  }

  return "\n\n";
}

function createConverter(): TurndownService {
  const service = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
  });

  service.use(gfm);
  service.remove((node) => {
    return shouldRemoveNode(node);
  });
  service.addRule("preformattedCode", {
    filter(node) {
      return node.nodeName.toUpperCase() === "PRE";
    },
    replacement(_content, node) {
      const element = node as Element;
      const { code, language } = extractPreContent(element);

      return buildFencedCodeBlock(code, language);
    },
  });
  service.addRule("details", {
    filter: "details",
    replacement(_content, node) {
      const element = node as Element;
      let summaryText = "";
      let summaryCaptured = false;
      const bodyParts: string[] = [];

      for (const child of Array.from(element.childNodes)) {
        if (
          !summaryCaptured &&
          child.nodeType === 1 &&
          (child as Element).tagName.toLowerCase() === "summary"
        ) {
          summaryCaptured = true;
          summaryText = child.textContent?.trim() ?? "";
          continue;
        }

        bodyParts.push(serializeNode(child));
      }

      const detailsBodyHtml = bodyParts.join("").trim();
      const detailsBody = detailsBodyHtml === "" ? "" : normalizeOutput(service.turndown(detailsBodyHtml));

      return renderDetailsContent(summaryText, detailsBody);
    },
  });

  return service;
}

const converter = createConverter();

export function convert(html: string): string {
  const normalizedInput = normalizeInput(html);

  if (normalizedInput.trim() === "") {
    return "";
  }

  if (COMMENT_ONLY_PATTERN.test(normalizedInput)) {
    return "";
  }

  if (!normalizedInput.includes("<") && !normalizedInput.includes("&")) {
    return normalizeOutput(normalizedInput);
  }

  return normalizeOutput(converter.turndown(normalizedInput));
}
