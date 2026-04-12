"use client";

import { useEffect, useState } from "react";
import { convert } from "@/lib/converter";
import HtmlEditor from "@/components/HtmlEditor";
import MarkdownPreview from "@/components/MarkdownPreview";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sun, Moon, CodeXml } from "lucide-react";

export default function HomePage() {
  const [html, setHtml] = useState("");
  const [markdown, setMarkdown] = useState("");
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    setDark(prefersDark);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  useEffect(() => {
    if (!html.trim()) {
      setMarkdown("");
      return;
    }
    setMarkdown(convert(html));
  }, [html]);

  return (
    <div className="flex flex-col h-dvh bg-background">
      {/* Header */}
      <header className="flex items-center justify-between px-5 py-3 border-b shrink-0 bg-muted/40 backdrop-blur-sm">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-foreground text-background">
            <CodeXml className="size-4" />
          </div>
          <span className="font-semibold text-sm tracking-tight">html2md</span>
          <Badge variant="secondary" className="hidden sm:inline-flex text-[10px] h-5">
            HTML → Markdown
          </Badge>
        </div>

        <div className="flex items-center gap-3">
          <span className="hidden md:block text-xs text-muted-foreground">
            实时转换 · 客户端处理
          </span>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => setDark((d) => !d)}
            title={dark ? "切换到浅色模式" : "切换到深色模式"}
          >
            {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </Button>
        </div>
      </header>

      {/* Main split pane */}
      <main className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-hidden border-r">
          <HtmlEditor value={html} onChange={setHtml} onClear={() => setHtml("")} />
        </div>
        <div className="flex-1 overflow-hidden">
          <MarkdownPreview markdown={markdown} />
        </div>
      </main>
    </div>
  );
}
