"use client";

import { applyChapterHtml, normalizeBookTitle, normalizeChapterTitle } from "@/lib/books/model";
import type { BookBackupManifest, BookRecord, BookRepository, BookSummary, ChapterRecord } from "@/lib/books/types";

const DATABASE_NAME = "html2md-library";
const DATABASE_VERSION = 1;
const BOOKS_STORE = "books";
const CHAPTERS_STORE = "chapters";

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;

  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });

  return { promise, resolve, reject };
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function transactionToPromise(transaction: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed"));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
  });
}

function assertIndexedDb(): IDBFactory {
  if (typeof indexedDB === "undefined") {
    throw new Error("当前环境不支持 IndexedDB。");
  }

  return indexedDB;
}

let databasePromise: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (databasePromise !== null) {
    return databasePromise;
  }

  const databaseFactory = assertIndexedDb();
  const openRequest = databaseFactory.open(DATABASE_NAME, DATABASE_VERSION);
  const deferred = createDeferred<IDBDatabase>();

  openRequest.onupgradeneeded = () => {
    const database = openRequest.result;

    if (!database.objectStoreNames.contains(BOOKS_STORE)) {
      database.createObjectStore(BOOKS_STORE, { keyPath: "id" });
    }

    if (!database.objectStoreNames.contains(CHAPTERS_STORE)) {
      const chapterStore = database.createObjectStore(CHAPTERS_STORE, { keyPath: "id" });
      chapterStore.createIndex("bookId", "bookId", { unique: false });
    }
  };

  openRequest.onsuccess = () => {
    const database = openRequest.result;
    database.onversionchange = () => {
      database.close();
      databasePromise = null;
    };
    deferred.resolve(database);
  };

  openRequest.onerror = () => {
    deferred.reject(openRequest.error ?? new Error("Failed to open IndexedDB"));
  };

  databasePromise = deferred.promise;
  return deferred.promise;
}

async function withTransaction<T>(
  storeNames: string[],
  mode: IDBTransactionMode,
  handler: (transaction: IDBTransaction) => Promise<T>,
): Promise<T> {
  const database = await openDatabase();
  const transaction = database.transaction(storeNames, mode);
  const completion = transactionToPromise(transaction);

  try {
    const result = await handler(transaction);
    await completion;
    return result;
  } catch (error) {
    transaction.abort();
    throw error;
  }
}

async function listChaptersInTransaction(transaction: IDBTransaction, bookId: string): Promise<ChapterRecord[]> {
  const chapterStore = transaction.objectStore(CHAPTERS_STORE);
  const chapters = await requestToPromise(chapterStore.index("bookId").getAll(bookId));
  return [...chapters].sort((left, right) => left.order - right.order);
}

async function touchBook(transaction: IDBTransaction, bookId: string, updatedAt: string): Promise<BookRecord> {
  const bookStore = transaction.objectStore(BOOKS_STORE);
  const book = await requestToPromise(bookStore.get(bookId));

  if (!book) {
    throw new Error("书籍不存在。");
  }

  const updatedBook: BookRecord = {
    ...book,
    updatedAt,
  };

  bookStore.put(updatedBook);
  return updatedBook;
}

class IndexedDbBookRepository implements BookRepository {
  async listBooks(): Promise<BookSummary[]> {
    return withTransaction([BOOKS_STORE, CHAPTERS_STORE], "readonly", async (transaction) => {
      const bookStore = transaction.objectStore(BOOKS_STORE);
      const chapterStore = transaction.objectStore(CHAPTERS_STORE);
      const books = await requestToPromise(bookStore.getAll());
      const chapters = await requestToPromise(chapterStore.getAll());
      const counts = new Map<string, number>();

      chapters.forEach((chapter) => {
        counts.set(chapter.bookId, (counts.get(chapter.bookId) ?? 0) + 1);
      });

      return [...books]
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
        .map((book) => ({
          ...book,
          chapterCount: counts.get(book.id) ?? 0,
        }));
    });
  }

  async getBook(bookId: string): Promise<BookRecord | null> {
    return withTransaction([BOOKS_STORE], "readonly", async (transaction) => {
      const bookStore = transaction.objectStore(BOOKS_STORE);
      return requestToPromise(bookStore.get(bookId));
    });
  }

  async createBook(title: string): Promise<BookRecord> {
    return withTransaction([BOOKS_STORE], "readwrite", async (transaction) => {
      const bookStore = transaction.objectStore(BOOKS_STORE);
      const timestamp = new Date().toISOString();
      const book: BookRecord = {
        id: crypto.randomUUID(),
        title: normalizeBookTitle(title),
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      bookStore.add(book);
      return book;
    });
  }

  async renameBook(bookId: string, title: string): Promise<BookRecord> {
    return withTransaction([BOOKS_STORE], "readwrite", async (transaction) => {
      const bookStore = transaction.objectStore(BOOKS_STORE);
      const existingBook = await requestToPromise(bookStore.get(bookId));

      if (!existingBook) {
        throw new Error("书籍不存在。");
      }

      const timestamp = new Date().toISOString();
      const updatedBook: BookRecord = {
        ...existingBook,
        title: normalizeBookTitle(title),
        updatedAt: timestamp,
      };

      bookStore.put(updatedBook);
      return updatedBook;
    });
  }

  async deleteBook(bookId: string): Promise<void> {
    await withTransaction([BOOKS_STORE, CHAPTERS_STORE], "readwrite", async (transaction) => {
      const bookStore = transaction.objectStore(BOOKS_STORE);
      const chapterStore = transaction.objectStore(CHAPTERS_STORE);
      const chapters = await listChaptersInTransaction(transaction, bookId);

      chapters.forEach((chapter) => {
        chapterStore.delete(chapter.id);
      });

      bookStore.delete(bookId);
    });
  }

  async listChapters(bookId: string): Promise<ChapterRecord[]> {
    return withTransaction([CHAPTERS_STORE], "readonly", async (transaction) => {
      return listChaptersInTransaction(transaction, bookId);
    });
  }

  async createChapter(bookId: string, title = ""): Promise<ChapterRecord> {
    return withTransaction([BOOKS_STORE, CHAPTERS_STORE], "readwrite", async (transaction) => {
      const chapterStore = transaction.objectStore(CHAPTERS_STORE);
      const timestamp = new Date().toISOString();
      const chapters = await listChaptersInTransaction(transaction, bookId);
      const chapter: ChapterRecord = {
        id: crypto.randomUUID(),
        bookId,
        title: normalizeChapterTitle(title, chapters.length + 1),
        order: chapters.length,
        html: "",
        markdown: "",
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      chapterStore.add(chapter);
      await touchBook(transaction, bookId, timestamp);
      return chapter;
    });
  }

  async renameChapter(bookId: string, chapterId: string, title: string): Promise<ChapterRecord> {
    return withTransaction([BOOKS_STORE, CHAPTERS_STORE], "readwrite", async (transaction) => {
      const chapterStore = transaction.objectStore(CHAPTERS_STORE);
      const existingChapter = await requestToPromise(chapterStore.get(chapterId));

      if (!existingChapter || existingChapter.bookId !== bookId) {
        throw new Error("章节不存在。");
      }

      const timestamp = new Date().toISOString();
      const updatedChapter: ChapterRecord = {
        ...existingChapter,
        title: normalizeChapterTitle(title, existingChapter.order + 1),
        updatedAt: timestamp,
      };

      chapterStore.put(updatedChapter);
      await touchBook(transaction, bookId, timestamp);
      return updatedChapter;
    });
  }

  async deleteChapter(bookId: string, chapterId: string): Promise<void> {
    await withTransaction([BOOKS_STORE, CHAPTERS_STORE], "readwrite", async (transaction) => {
      const chapterStore = transaction.objectStore(CHAPTERS_STORE);
      const timestamp = new Date().toISOString();
      const chapters = await listChaptersInTransaction(transaction, bookId);
      const nextChapters = chapters.filter((chapter) => chapter.id !== chapterId);

      if (nextChapters.length === chapters.length) {
        return;
      }

      chapterStore.delete(chapterId);

      nextChapters.forEach((chapter, index) => {
        if (chapter.order !== index) {
          chapterStore.put({
            ...chapter,
            order: index,
            updatedAt: timestamp,
          } satisfies ChapterRecord);
        }
      });

      await touchBook(transaction, bookId, timestamp);
    });
  }

  async moveChapter(bookId: string, chapterId: string, direction: "up" | "down"): Promise<ChapterRecord[]> {
    return withTransaction([BOOKS_STORE, CHAPTERS_STORE], "readwrite", async (transaction) => {
      const chapterStore = transaction.objectStore(CHAPTERS_STORE);
      const timestamp = new Date().toISOString();
      const chapters = await listChaptersInTransaction(transaction, bookId);
      const currentIndex = chapters.findIndex((chapter) => chapter.id === chapterId);

      if (currentIndex === -1) {
        throw new Error("章节不存在。");
      }

      const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
      if (targetIndex < 0 || targetIndex >= chapters.length) {
        return chapters;
      }

      const reorderedChapters = [...chapters];
      const [chapter] = reorderedChapters.splice(currentIndex, 1);
      reorderedChapters.splice(targetIndex, 0, chapter);

      reorderedChapters.forEach((chapterItem, index) => {
        chapterStore.put({
          ...chapterItem,
          order: index,
          updatedAt: timestamp,
        } satisfies ChapterRecord);
      });

      await touchBook(transaction, bookId, timestamp);
      return reorderedChapters.map((chapterItem, index) => ({
        ...chapterItem,
        order: index,
        updatedAt: timestamp,
      }));
    });
  }

  async updateChapterHtml(bookId: string, chapterId: string, html: string): Promise<ChapterRecord> {
    return withTransaction([BOOKS_STORE, CHAPTERS_STORE], "readwrite", async (transaction) => {
      const chapterStore = transaction.objectStore(CHAPTERS_STORE);
      const existingChapter = await requestToPromise(chapterStore.get(chapterId));

      if (!existingChapter || existingChapter.bookId !== bookId) {
        throw new Error("章节不存在。");
      }

      const timestamp = new Date().toISOString();
      const updatedChapter = applyChapterHtml(existingChapter, html, timestamp);

      chapterStore.put(updatedChapter);
      await touchBook(transaction, bookId, timestamp);
      return updatedChapter;
    });
  }

  async importBookBackup(backup: BookBackupManifest): Promise<BookRecord> {
    return withTransaction([BOOKS_STORE, CHAPTERS_STORE], "readwrite", async (transaction) => {
      const bookStore = transaction.objectStore(BOOKS_STORE);
      const chapterStore = transaction.objectStore(CHAPTERS_STORE);
      const bookId = crypto.randomUUID();
      const timestamp = new Date().toISOString();
      const normalizedChapters = [...backup.chapters].sort((left, right) => left.order - right.order);
      const latestUpdate =
        normalizedChapters.reduce(
          (current, chapter) => (chapter.updatedAt > current ? chapter.updatedAt : current),
          backup.book.updatedAt,
        ) || timestamp;

      const book: BookRecord = {
        id: bookId,
        title: normalizeBookTitle(backup.book.title),
        createdAt: backup.book.createdAt || timestamp,
        updatedAt: latestUpdate,
      };

      bookStore.add(book);

      normalizedChapters.forEach((chapter, index) => {
        chapterStore.add({
          id: crypto.randomUUID(),
          bookId,
          title: normalizeChapterTitle(chapter.title, index + 1),
          order: index,
          html: chapter.html,
          markdown: chapter.markdown,
          createdAt: chapter.createdAt || timestamp,
          updatedAt: chapter.updatedAt || timestamp,
        } satisfies ChapterRecord);
      });

      return book;
    });
  }
}

let repository: BookRepository | null = null;

export function getBookRepository(): BookRepository {
  if (repository === null) {
    repository = new IndexedDbBookRepository();
  }

  return repository;
}
