import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

function serializeNode(node: ChildNode): string {
  if ("outerHTML" in node && typeof node.outerHTML === "string") {
    return node.outerHTML;
  }

  return node.textContent ?? "";
}

function buildFencedCodeBlock(code: string, language: string): string {
  const trimmedCode = code.replace(/\n$/, "");
  const fence = "```";

  return `\n\n${fence}${language}\n${trimmedCode}\n${fence}\n\n`;
}

function createConverter(): TurndownService {
  const service = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
  });

  service.use(gfm);
  service.remove(["style", "script", "noscript"]);
  service.remove((node) => {
    return node.nodeName === "SVG";
  });
  service.remove((node) => {
    if (!("classList" in node) || node.classList === undefined) {
      return false;
    }

    return node.classList.contains("code-block-extension-header");
  });
  service.addRule("preformattedCode", {
    filter(node) {
      return node.nodeName === "PRE";
    },
    replacement(_content, node) {
      const element = node as Element;
      const codeElement = element.querySelector("code");
      const className = codeElement?.getAttribute("class") ?? "";
      const language = (className.match(/language-(\S+)/) ?? [null, ""])[1];
      const code = codeElement?.textContent ?? element.textContent ?? "";

      return buildFencedCodeBlock(code, language);
    },
  });
  service.addRule("details", {
    filter: "details",
    replacement(_content, node) {
      const element = node as Element;
      const children = Array.from(element.childNodes);
      const summaryNode = children.find((child) => {
        return child.nodeType === 1 && (child as Element).tagName.toLowerCase() === "summary";
      }) as Element | undefined;

      const summaryText = summaryNode?.textContent?.trim() ?? "";
      const detailsBodyHtml = children
        .filter((child) => child !== summaryNode)
        .map((child) => serializeNode(child))
        .join("")
        .trim();
      const detailsBody = detailsBodyHtml === "" ? "" : service.turndown(detailsBodyHtml).trim();

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
    },
  });

  return service;
}

const converter = createConverter();

export function convert(html: string): string {
  return converter.turndown(html).trim();
}
