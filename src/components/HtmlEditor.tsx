"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Link2, Trash2, Upload } from "lucide-react";

interface Props {
  value: string;
  onChange: (value: string) => void;
  onClear: () => void;
  onOpenLinkImport: () => void;
}

export default function HtmlEditor({ value, onChange, onClear, onOpenLinkImport }: Props) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      className="flex h-full flex-col"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Panel header */}
      <div className="flex items-center justify-between border-b border-blue-100 bg-[#f8fbff] px-4 py-3 dark:border-[#1e3556] dark:bg-[#12243e]">
        <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          HTML 输入
        </span>
        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 rounded-full border-blue-100 bg-white text-xs dark:border-[#24456d] dark:bg-[#0f1c31]"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="size-3" />
            上传文件
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 rounded-full border-blue-100 bg-white text-xs dark:border-[#24456d] dark:bg-[#0f1c31]"
            onClick={onOpenLinkImport}
          >
            <Link2 className="size-3" />
            链接采集
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 rounded-full border-blue-100 bg-white text-xs hover:border-destructive hover:text-destructive dark:border-[#24456d] dark:bg-[#0f1c31]"
            onClick={onClear}
            disabled={!value}
          >
            <Trash2 className="size-3" />
            清空
          </Button>
        </div>
      </div>

      {/* Textarea */}
      <div className="relative flex-1 overflow-hidden bg-white dark:bg-[#0f1c31]">
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={"在此粘贴 HTML 代码\n或将 .html 文件拖放到此区域…"}
          spellCheck={false}
          className="h-full w-full resize-none p-5 font-mono text-sm leading-7 text-slate-700 outline-none placeholder:text-slate-400 caret-blue-500 dark:text-blue-50 dark:placeholder:text-slate-500"
          style={{ background: "transparent" }}
        />

        {/* Drag overlay */}
        {isDragging && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-md border-2 border-dashed border-blue-400 bg-blue-500/10 pointer-events-none">
            <Upload className="size-9 text-blue-500" />
            <span className="text-sm font-medium text-blue-600 dark:text-blue-300">释放以上传文件</span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-blue-100 bg-[#f8fbff] px-4 py-2 text-xs text-muted-foreground dark:border-[#1e3556] dark:bg-[#12243e]">
        <span>{value.length.toLocaleString()} 字符</span>
        <span>UTF-8</span>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".html,.htm"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  );
}
