import { convert } from "@/lib/converter";
import type { ChapterRecord } from "@/lib/books/types";

export function normalizeBookTitle(title: string): string {
  const trimmed = title.trim();
  return trimmed === "" ? "未命名书籍" : trimmed;
}

export function normalizeChapterTitle(title: string, fallbackIndex: number): string {
  const trimmed = title.trim();
  return trimmed === "" ? `第 ${fallbackIndex} 章` : trimmed;
}

export function applyChapterHtml(chapter: ChapterRecord, html: string, updatedAt: string): ChapterRecord {
  return {
    ...chapter,
    html,
    markdown: html.trim() === "" ? "" : convert(html),
    updatedAt,
  };
}
