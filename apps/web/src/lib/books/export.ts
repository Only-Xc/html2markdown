import JSZip from "jszip";
import type { BookBackupManifest, BookRecord, ChapterRecord, ExportToc } from "@/lib/books/types";
import { normalizeBookTitle, normalizeChapterTitle } from "@/lib/books/model";

export interface ExportArtifact {
  fileName: string;
  title: string;
  content: string;
}

export interface ExportBundle {
  toc: ExportToc;
  readme: string;
  chapters: ExportArtifact[];
  backup: BookBackupManifest;
}

function sanitizeFileSegment(input: string): string {
  const sanitized = input
    .normalize("NFKC")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[.\-\s]+|[.\-\s]+$/g, "");

  return sanitized === "" ? "untitled-chapter" : sanitized;
}

function padOrder(order: number, total: number): string {
  const width = Math.max(2, String(total).length);
  return String(order).padStart(width, "0");
}

function sortChapters(chapters: ChapterRecord[]): ChapterRecord[] {
  return [...chapters].sort((left, right) => left.order - right.order);
}

function buildChapterArtifacts(chapters: ChapterRecord[]): ExportArtifact[] {
  const seenNames = new Map<string, number>();
  const sortedChapters = sortChapters(chapters);

  return sortedChapters.map((chapter, index) => {
    const title = normalizeChapterTitle(chapter.title, index + 1);
    const baseName = sanitizeFileSegment(title);
    const duplicateCount = (seenNames.get(baseName) ?? 0) + 1;
    seenNames.set(baseName, duplicateCount);

    const uniqueName = duplicateCount === 1 ? baseName : `${baseName}-${duplicateCount}`;
    const fileName = `${padOrder(index + 1, sortedChapters.length)}-${uniqueName}.md`;

    return {
      fileName,
      title,
      content: chapter.markdown,
    };
  });
}

function buildReadme(bookTitle: string, exportedAt: string, chapters: ExportArtifact[]): string {
  const lines = [
    `# ${bookTitle}`,
    "",
    `导出时间：${exportedAt}`,
    "",
    "## 目录",
    "",
  ];

  if (chapters.length === 0) {
    lines.push("- 暂无章节");
  } else {
    chapters.forEach((chapter, index) => {
      lines.push(`${index + 1}. ${chapter.title} (${chapter.fileName})`);
    });
  }

  lines.push("");

  return lines.join("\n");
}

export function buildExportBundle(book: BookRecord, chapters: ChapterRecord[], exportedAt = new Date().toISOString()): ExportBundle {
  const bookTitle = normalizeBookTitle(book.title);
  const sortedChapters = sortChapters(chapters);
  const chapterArtifacts = buildChapterArtifacts(sortedChapters);
  const toc: ExportToc = {
    title: bookTitle,
    exportedAt,
    chapters: chapterArtifacts.map((chapter, index) => ({
      order: index + 1,
      title: chapter.title,
      fileName: chapter.fileName,
    })),
  };

  const backup: BookBackupManifest = {
    version: 1,
    exportedAt,
    book: {
      title: bookTitle,
      createdAt: book.createdAt,
      updatedAt: book.updatedAt,
    },
    chapters: sortedChapters.map((chapter) => ({
      title: chapter.title,
      order: chapter.order,
      html: chapter.html,
      markdown: chapter.markdown,
      createdAt: chapter.createdAt,
      updatedAt: chapter.updatedAt,
    })),
  };

  return {
    toc,
    readme: buildReadme(bookTitle, exportedAt, chapterArtifacts),
    chapters: chapterArtifacts,
    backup,
  };
}

export async function exportBookArchive(book: BookRecord, chapters: ChapterRecord[]): Promise<Blob> {
  if (chapters.length === 0) {
    throw new Error("当前书籍还没有章节，暂时无法导出。");
  }

  const bundle = buildExportBundle(book, chapters);
  const zip = new JSZip();

  bundle.chapters.forEach((chapter) => {
    zip.file(chapter.fileName, chapter.content);
  });

  zip.file("README.md", bundle.readme);
  zip.file("toc.json", JSON.stringify(bundle.toc, null, 2));
  zip.file("book.json", JSON.stringify(bundle.backup, null, 2));

  return zip.generateAsync({ type: "blob" });
}

function isValidBackupManifest(value: unknown): value is BookBackupManifest {
  if (!value || typeof value !== "object") {
    return false;
  }

  const manifest = value as Partial<BookBackupManifest>;
  return (
    manifest.version === 1 &&
    typeof manifest.exportedAt === "string" &&
    typeof manifest.book?.title === "string" &&
    typeof manifest.book?.createdAt === "string" &&
    typeof manifest.book?.updatedAt === "string" &&
    Array.isArray(manifest.chapters) &&
    manifest.chapters.every((chapter) =>
      typeof chapter?.title === "string" &&
      typeof chapter?.order === "number" &&
      typeof chapter?.html === "string" &&
      typeof chapter?.markdown === "string" &&
      typeof chapter?.createdAt === "string" &&
      typeof chapter?.updatedAt === "string",
    )
  );
}

export async function importBookManifest(file: Blob): Promise<BookBackupManifest> {
  const manifestText = await file.text();
  let parsed: unknown;

  try {
    parsed = JSON.parse(manifestText);
  } catch {
    throw new Error("导入失败：book.json 不是有效的 JSON。");
  }

  if (!isValidBackupManifest(parsed)) {
    throw new Error("导入失败：book.json 结构无效或版本不受支持。");
  }

  return parsed;
}
