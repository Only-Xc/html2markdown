"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { Button } from "@/components/ui/button";
import { Copy, Check, Download, FileText } from "lucide-react";

interface Props {
  markdown: string;
}

export default function MarkdownPreview({ markdown }: Props) {
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
    a.download = "output.md";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col h-full">
      {/* Panel header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b bg-muted/40">
        <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          预览
        </span>
        <div className="flex items-center gap-1.5">
          <Button
            variant={copied ? "secondary" : "outline"}
            size="sm"
            className="h-7 text-xs gap-1.5"
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
            className="h-7 text-xs gap-1.5"
            onClick={handleDownload}
            disabled={!markdown}
          >
            <Download className="size-3" />
            下载 .md
          </Button>
        </div>
      </div>

      {/* Preview area */}
      <div className="flex-1 overflow-auto bg-background">
        {markdown ? (
          <div className="px-8 py-6">
            <div className="prose">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeRaw]}
              >
                {markdown}
              </ReactMarkdown>
            </div>
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center gap-3 select-none text-muted-foreground">
            <FileText className="size-10 stroke-1" />
            <span className="text-sm">在左侧输入 HTML，预览将实时显示</span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-1.5 border-t bg-muted/40 text-xs text-muted-foreground">
        <span>{markdown ? `${markdown.split("\n").length} 行` : "空"}</span>
        <span>Markdown</span>
      </div>
    </div>
  );
}
