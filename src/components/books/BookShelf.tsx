"use client";

import { App, Input, Modal } from "antd";
import { ChangeEvent, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowUpRight, BookMarked, LibraryBig, Moon, Plus, Sparkles, Sun, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { importBookManifest } from "@/lib/books/export";
import { getBookRepository } from "@/lib/books/repository";
import type { BookSummary } from "@/lib/books/types";
import { useThemeMode } from "@/lib/use-theme";

const COVER_STYLES = [
  "bg-[#eef4ff] text-[#163d7a]",
  "bg-[#edf3fb] text-[#21476f]",
  "bg-[#f1f6ff] text-[#234a74]",
  "bg-[#edf5ff] text-[#17416d]",
  "bg-[#eff5fd] text-[#1f466f]",
];

export default function BookShelf() {
  const router = useRouter();
  const repository = getBookRepository();
  const { dark, toggleDark } = useThemeMode();
  const { modal, message } = App.useApp();
  const [books, setBooks] = useState<BookSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createDraft, setCreateDraft] = useState("");
  const [importing, setImporting] = useState(false);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  async function loadBooks() {
    try {
      setLoading(true);
      setBooks(await repository.listBooks());
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "书架加载失败。");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadBooks();
  }, []);

  async function handleCreateBook() {
    try {
      setCreating(true);
      const book = await repository.createBook(createDraft);
      setCreateDraft("");
      setCreateModalOpen(false);
      message.success("书籍已创建。");
      router.push(`/books/${book.id}`);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "创建书籍失败。");
    } finally {
      setCreating(false);
    }
  }

  async function handleDeleteBook(bookId: string) {
    const targetBook = books.find((book) => book.id === bookId);

    void modal.confirm({
      title: "删除书籍",
      content: `删除《${targetBook?.title ?? "这本书"}》后，全部章节也会一起删除。`,
      okText: "确认删除",
      cancelText: "取消",
      okButtonProps: { danger: true },
      async onOk() {
        try {
          setDeletingId(bookId);
          await repository.deleteBook(bookId);
          await loadBooks();
          message.success("书籍已删除。");
        } catch (deleteError) {
          setError(deleteError instanceof Error ? deleteError.message : "删除书籍失败。");
          throw deleteError;
        } finally {
          setDeletingId(null);
        }
      },
    });
  }

  async function handleImportBook(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    try {
      setImporting(true);
      const backup = await importBookManifest(file);
      const importedBook = await repository.importBookBackup(backup);
      await loadBooks();
      message.success(`《${importedBook.title}》已导入书架。`);
      router.push(`/books/${importedBook.id}`);
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "导入书籍失败。");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="min-h-dvh bg-[#f5f8fd] text-foreground dark:bg-[#0a1424]">
      <div className="mx-auto flex min-h-dvh max-w-7xl flex-col px-4 py-4 sm:px-6 lg:px-8">
        <header className="rounded-[24px] border border-blue-100 bg-white px-5 py-4 shadow-sm dark:border-[#1e3556] dark:bg-[#0f1c31]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-3xl">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-blue-700 dark:border-[#24456d] dark:bg-[#11243f] dark:text-blue-200">
                <Sparkles className="size-3.5" />
                本地书籍工坊
              </div>
              <h1 className="max-w-2xl text-2xl font-semibold tracking-tight text-slate-900 dark:text-white sm:text-[2.75rem]">
                把零散 HTML 章节，整理成一整本可以导出的书。
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300 sm:text-[15px]">
                以微信读书式的简约书架管理作品，用更安静的编辑视图沉淀章节。每次保存都会自动把 HTML 转成 Markdown，最后一键打包整本书。
              </p>
            </div>

            <div className="flex items-center gap-2">
              <input
                ref={importInputRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(event) => void handleImportBook(event)}
              />
              <Button
                type="button"
                variant="outline"
                className="h-11 rounded-full border-blue-100 bg-white px-5 text-sm dark:border-[#24456d] dark:bg-[#142844]"
                disabled={importing}
                onClick={() => importInputRef.current?.click()}
              >
                <Upload className="size-4" />
                {importing ? "导入中..." : "导入 book.json"}
              </Button>
              <Button
                type="button"
                className="h-11 rounded-full bg-blue-600 px-5 text-sm text-white hover:bg-blue-500"
                disabled={creating}
                onClick={() => setCreateModalOpen(true)}
              >
                <Plus className="size-4" />
                新建书籍
              </Button>
              <Button variant="outline" size="icon" className="h-11 w-11 shrink-0 rounded-full border-blue-100 bg-white dark:border-[#24456d] dark:bg-[#142844]" onClick={toggleDark}>
                {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
              </Button>
            </div>
          </div>

          {error ? (
            <div className="mt-5 rounded-[22px] border border-red-300/60 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-200">
              {error}
            </div>
          ) : null}
        </header>

        <main className="mt-6 flex-1">
          <div className="mb-5 flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                我的书架
              </p>
              <p className="mt-2 max-w-xl text-sm leading-7 text-slate-600 dark:text-slate-300">
                {loading ? "正在整理书籍..." : `共 ${books.length} 本书`}
              </p>
            </div>
            <div className="hidden items-center gap-2 rounded-full border border-blue-100 bg-white px-4 py-2 text-sm text-slate-600 md:inline-flex dark:border-[#24456d] dark:bg-[#12243e] dark:text-slate-300">
              <BookMarked className="size-4 text-blue-600 dark:text-blue-300" />
              内容优先的本地蓝白书架
            </div>
          </div>

          {loading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 5 }).map((_, index) => (
                <div
                  key={index}
                  className="aspect-[3/4] animate-pulse rounded-[28px] border border-blue-100 bg-white dark:border-[#1e3556] dark:bg-[#0f1c31]"
                />
              ))}
            </div>
          ) : books.length === 0 ? (
            <div className="flex min-h-[420px] flex-col items-center justify-center rounded-[28px] border border-dashed border-blue-200 bg-white px-6 text-center dark:border-[#24456d] dark:bg-[#0f1c31]">
              <LibraryBig className="size-12 text-blue-300 dark:text-blue-300/60" />
              <h2 className="mt-5 text-2xl font-semibold text-slate-900 dark:text-white">书架还是空的</h2>
              <p className="mt-2 max-w-md text-sm leading-7 text-slate-600 dark:text-slate-300">
                先创建一本书，再为它逐章录入 HTML。后续保存会自动生成 Markdown，并支持整本导出。
              </p>
            </div>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              <button
                type="button"
                className="group aspect-[3/4] cursor-pointer rounded-[28px] border border-dashed border-blue-200 bg-white p-4 text-left transition hover:-translate-y-1 hover:border-blue-300 dark:border-[#24456d] dark:bg-[#0f1c31] dark:hover:border-blue-300/40"
                onClick={() => setCreateModalOpen(true)}
              >
                <div className="flex h-full flex-col justify-between rounded-[22px] border border-blue-100 bg-[#f7faff] p-5 dark:border-[#24456d] dark:bg-[#12243e]">
                  <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-400/10 dark:text-blue-200">
                    <Plus className="size-5" />
                  </div>
                  <div>
                    <div className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
                      新建一本书
                    </div>
                    <p className="mt-3 text-sm leading-7 text-slate-600 dark:text-slate-300">
                      从空白书架位开始，先起书名，再逐章录入 HTML 内容。
                    </p>
                  </div>
                </div>
              </button>

              {books.map((book, index) => (
                <article
                  key={book.id}
                  className="group relative overflow-hidden rounded-[28px] border border-blue-100 bg-white p-3 transition hover:-translate-y-1 dark:border-[#1e3556] dark:bg-[#0f1c31]"
                >
                  <button
                    type="button"
                    className="absolute right-5 top-5 z-10 rounded-full border border-blue-100 bg-white p-2 text-slate-500 opacity-0 transition group-hover:opacity-100 hover:text-red-500 dark:border-[#24456d] dark:bg-[#12243e] dark:text-slate-300"
                    onClick={() => void handleDeleteBook(book.id)}
                    disabled={deletingId === book.id}
                    aria-label={`删除《${book.title}》`}
                  >
                    <Trash2 className="size-4" />
                  </button>

                  <Link href={`/books/${book.id}`} className="block">
                    <div className={`aspect-[3/4] rounded-[24px] ${COVER_STYLES[index % COVER_STYLES.length]} p-3`}>
                      <div className="flex h-full flex-col justify-between rounded-[18px] border border-blue-100 bg-white p-5 dark:border-[#24456d] dark:bg-[#12243e] dark:text-white">
                        <div className="flex items-center justify-between">
                          <div className="text-[10px] font-semibold uppercase tracking-[0.32em] text-blue-600 dark:text-blue-200">
                            WeRead style
                          </div>
                          <ArrowUpRight className="size-4 text-blue-500 dark:text-blue-200" />
                        </div>
                        <div className="space-y-3">
                          <div className="h-px w-14 bg-blue-200 dark:bg-blue-200/30" />
                          <div className="max-w-[11ch] text-[28px] font-semibold leading-[1.18] tracking-tight [text-wrap:balance]">
                            {book.title}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-300">
                            点击进入章节工作台
                          </div>
                        </div>
                      </div>
                    </div>
                  </Link>
                </article>
              ))}
            </div>
          )}
        </main>
      </div>

      <Modal
        title="新建书籍"
        open={createModalOpen}
        okText={creating ? "创建中..." : "创建并进入"}
        cancelText="取消"
        onCancel={() => {
          if (!creating) {
            setCreateModalOpen(false);
          }
        }}
        onOk={() => void handleCreateBook()}
        confirmLoading={creating}
        destroyOnHidden
      >
        <div className="pt-2">
          <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">
            书名
          </label>
          <Input
            size="large"
            value={createDraft}
            placeholder="例如：产品设计手记"
            onChange={(event) => setCreateDraft(event.target.value)}
            onPressEnter={() => void handleCreateBook()}
          />
        </div>
      </Modal>
    </div>
  );
}
