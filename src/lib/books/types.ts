export interface BookRecord {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface BookSummary extends BookRecord {
  chapterCount: number;
}

export interface ChapterRecord {
  id: string;
  bookId: string;
  title: string;
  order: number;
  html: string;
  markdown: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExportTocChapter {
  order: number;
  title: string;
  fileName: string;
}

export interface ExportToc {
  title: string;
  exportedAt: string;
  chapters: ExportTocChapter[];
}

export interface BookBackupChapter {
  title: string;
  order: number;
  html: string;
  markdown: string;
  createdAt: string;
  updatedAt: string;
}

export interface BookBackupManifest {
  version: 1;
  exportedAt: string;
  book: {
    title: string;
    createdAt: string;
    updatedAt: string;
  };
  chapters: BookBackupChapter[];
}

export interface BookRepository {
  listBooks(): Promise<BookSummary[]>;
  getBook(bookId: string): Promise<BookRecord | null>;
  createBook(title: string): Promise<BookRecord>;
  renameBook(bookId: string, title: string): Promise<BookRecord>;
  deleteBook(bookId: string): Promise<void>;
  listChapters(bookId: string): Promise<ChapterRecord[]>;
  createChapter(bookId: string, title?: string): Promise<ChapterRecord>;
  renameChapter(bookId: string, chapterId: string, title: string): Promise<ChapterRecord>;
  deleteChapter(bookId: string, chapterId: string): Promise<void>;
  moveChapter(bookId: string, chapterId: string, direction: "up" | "down"): Promise<ChapterRecord[]>;
  reorderChapters(bookId: string, orderedChapterIds: string[]): Promise<ChapterRecord[]>;
  updateChapterHtml(bookId: string, chapterId: string, html: string): Promise<ChapterRecord>;
  importBookBackup(backup: BookBackupManifest): Promise<BookRecord>;
}
