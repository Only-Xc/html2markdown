"use client";

import { useState } from "react";
import { Upload } from "lucide-react";

interface Props {
  value: string;
  onChange: (value: string) => void;
}

export default function HtmlEditor({ value, onChange }: Props) {
  const [isDragging, setIsDragging] = useState(false);

  function handleFileRead(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      onChange(e.target?.result as string);
    };
    reader.readAsText(file, "utf-8");
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFileRead(file);
    e.target.value = "";
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragging(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileRead(file);
  }

  return (
    <div
      className="flex h-full min-h-0 flex-col bg-white dark:bg-[#0f1c31]"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="relative flex-1 overflow-hidden bg-white dark:bg-[#0b1220]">
        <div className="mx-auto flex h-full w-full max-w-[1280px] px-4 sm:px-6 lg:px-10 xl:px-14">
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={"在此粘贴 HTML 代码\n或将 .html 文件拖放到此区域…"}
            spellCheck={false}
            className="h-full w-full resize-none border-0 bg-transparent px-0 py-6 font-mono text-[14px] leading-7 text-slate-700 outline-none placeholder:text-slate-400 caret-blue-500 dark:text-blue-50 dark:placeholder:text-slate-500 sm:py-8 lg:py-10 lg:text-[15px] lg:leading-8"
          />
        </div>

        {isDragging && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 border-2 border-dashed border-blue-400 bg-blue-500/10">
            <Upload className="size-9 text-blue-500" />
            <span className="text-sm font-medium text-blue-600 dark:text-blue-300">释放以上传文件</span>
          </div>
        )}
      </div>
    </div>
  );
}
