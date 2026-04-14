"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { Button } from "@/components/ui/button";
import { Copy, Check, Download, FileText } from "lucide-react";

interface Props {
  markdown: string;
  title: string;
}

function toDownloadFileName(title: string): string {
  const baseName = title
    .normalize("NFKC")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return `${baseName || "未命名章节"}.md`;
}

export default function MarkdownPreview({ markdown, title }: Props) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleDownload() {
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = toDownloadFileName(title);
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Panel header */}
      <div className="flex items-center justify-between border-b border-blue-100 bg-[#f8fbff] px-4 py-3 dark:border-[#1e3556] dark:bg-[#12243e]">
        <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          预览
        </span>
        <div className="flex items-center gap-1.5">
          <Button
            variant={copied ? "secondary" : "outline"}
            size="sm"
            className="h-8 gap-1.5 rounded-full border-blue-100 bg-white text-xs dark:border-[#24456d] dark:bg-[#0f1c31]"
            onClick={handleCopy}
            disabled={!markdown}
          >
            {copied ? (
              <>
                <Check className="size-3" />
                已复制
              </>
            ) : (
              <>
                <Copy className="size-3" />
                复制 MD
              </>
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 rounded-full border-blue-100 bg-white text-xs dark:border-[#24456d] dark:bg-[#0f1c31]"
            onClick={handleDownload}
            disabled={!markdown}
          >
            <Download className="size-3" />
            下载 .md
          </Button>
        </div>
      </div>

      {/* Preview area */}
      <div className="min-h-0 flex-1 overflow-auto bg-[#f8fbff] dark:bg-[#0f1c31]">
        {markdown ? (
          <div className="px-5 py-5 lg:px-8 lg:py-8">
            <div className="mx-auto max-w-4xl rounded-[28px] border border-blue-100 bg-[linear-gradient(180deg,#ffffff_0%,#fdfefe_100%)] px-6 py-8 shadow-[0_18px_50px_-32px_rgba(37,99,235,0.35)] dark:border-[#24456d] dark:bg-[linear-gradient(180deg,#12243e_0%,#102038_100%)] lg:px-10 lg:py-10">
              <div className="prose max-w-none">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeRaw]}
              >
                {markdown}
              </ReactMarkdown>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 select-none text-muted-foreground">
            <FileText className="size-10 stroke-1 text-blue-300 dark:text-blue-300/70" />
            <span className="text-sm">在左侧输入 HTML，预览将实时显示</span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-blue-100 bg-[#f8fbff] px-4 py-2 text-xs text-muted-foreground dark:border-[#1e3556] dark:bg-[#12243e]">
        <span>{markdown ? `${markdown.split("\n").length} 行` : "空"}</span>
        <span>Markdown</span>
      </div>
    </div>
  );
}
