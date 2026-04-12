"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Upload, Trash2 } from "lucide-react";

interface Props {
  value: string;
  onChange: (value: string) => void;
  onClear: () => void;
}

export default function HtmlEditor({ value, onChange, onClear }: Props) {
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
      className="flex flex-col h-full"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Panel header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b bg-muted/40">
        <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          HTML 输入
        </span>
        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1.5"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="size-3" />
            上传文件
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1.5 hover:text-destructive hover:border-destructive"
            onClick={onClear}
            disabled={!value}
          >
            <Trash2 className="size-3" />
            清空
          </Button>
        </div>
      </div>

      {/* Textarea */}
      <div className="relative flex-1 overflow-hidden bg-zinc-950 dark:bg-zinc-900">
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={"在此粘贴 HTML 代码\n或将 .html 文件拖放到此区域…"}
          spellCheck={false}
          className="w-full h-full resize-none outline-none p-4 text-sm leading-relaxed font-mono text-zinc-300 placeholder:text-zinc-600 caret-indigo-500"
          style={{ background: "transparent" }}
        />

        {/* Drag overlay */}
        {isDragging && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 pointer-events-none bg-indigo-500/10 border-2 border-dashed border-indigo-500 rounded-md">
            <Upload className="size-9 text-indigo-500" />
            <span className="text-sm font-medium text-indigo-500">释放以上传文件</span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-1.5 border-t bg-muted/40 text-xs text-muted-foreground">
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
