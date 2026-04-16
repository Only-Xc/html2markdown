"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { FileText } from "lucide-react";

interface Props {
  markdown: string;
}

export default function MarkdownPreview({ markdown }: Props) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-white dark:bg-[#0f1c31]">
      <div className="min-h-0 flex-1 overflow-auto bg-white dark:bg-[#0b1220]">
        {markdown ? (
          <div className="min-h-full px-4 py-4 sm:px-6 lg:px-10 lg:py-8 xl:px-14">
            <div className="mx-auto w-full max-w-[1120px] py-2 lg:py-4">
              <div className="prose prose-immersive max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
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
    </div>
  );
}
