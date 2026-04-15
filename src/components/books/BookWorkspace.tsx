"use client";

import { App, Input, Modal } from "antd";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, useCallback, useDeferredValue, useEffect, useRef, useState } from "react";
import { ArrowLeft, BookOpenText, Check, Download, FileText, ListTree, Moon, PenSquare, Plus, Sun, Trash2 } from "lucide-react";
import HtmlEditor from "@/components/HtmlEditor";
import LinkImportPanel from "@/components/LinkImportPanel";
import MarkdownPreview from "@/components/MarkdownPreview";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { exportBookArchive } from "@/lib/books/export";
import { getBookRepository } from "@/lib/books/repository";
import type { BookRecord, ChapterRecord } from "@/lib/books/types";
import { useThemeMode } from "@/lib/use-theme";
import { convert } from "@/lib/converter";

type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function formatArchiveName(title: string): string {
  const baseName = title
    .normalize("NFKC")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[.\-\s]+|[.\-\s]+$/g, "");

  return `${baseName || "book"}.zip`;
}

function saveLabel(state: SaveState): string {
  switch (state) {
    case "dirty":
      return "未保存";
    case "saving":
      return "保存中";
    case "saved":
      return "已保存";
    case "error":
      return "保存失败";
    default:
      return "已同步";
  }
}

interface Props {
  bookId: string;
}

export default function BookWorkspace({ bookId }: Props) {
  const router = useRouter();
  const repository = getBookRepository();
  const { dark, toggleDark } = useThemeMode();
  const { modal, message } = App.useApp();
  const [book, setBook] = useState<BookRecord | null>(null);
  const [chapters, setChapters] = useState<ChapterRecord[]>([]);
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null);
  const [draftHtml, setDraftHtml] = useState("");
  const [panel, setPanel] = useState<"edit" | "preview">("edit");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [bookTitleModalOpen, setBookTitleModalOpen] = useState(false);
  const [bookTitleDraft, setBookTitleDraft] = useState("");
  const [chapterTitleModalOpen, setChapterTitleModalOpen] = useState(false);
  const [chapterTitleDraft, setChapterTitleDraft] = useState("");
  const [renamingChapter, setRenamingChapter] = useState<ChapterRecord | null>(null);
  const [linkImportModalOpen, setLinkImportModalOpen] = useState(false);
  const deferredHtml = useDeferredValue(draftHtml);
  const selectedChapter = chapters.find((chapter) => chapter.id === selectedChapterId) ?? null;
  const liveMarkdown = deferredHtml.trim() === "" ? "" : convert(deferredHtml);
  const bookRef = useRef(book);
  const chaptersRef = useRef(chapters);
  const selectedChapterIdRef = useRef(selectedChapterId);
  const draftHtmlRef = useRef(draftHtml);

  useEffect(() => {
    bookRef.current = book;
    chaptersRef.current = chapters;
    selectedChapterIdRef.current = selectedChapterId;
    draftHtmlRef.current = draftHtml;
  }, [book, chapters, selectedChapterId, draftHtml]);

  const loadWorkspace = useCallback(async (preferredChapterId?: string | null) => {
    try {
      setLoading(true);
      const [bookRecord, chapterRecords] = await Promise.all([
        repository.getBook(bookId),
        repository.listChapters(bookId),
      ]);

      if (!bookRecord) {
        router.replace("/");
        return;
      }

      startTransition(() => {
        setBook(bookRecord);
        setChapters(chapterRecords);
        setError("");
      });

      const nextSelectedId =
        preferredChapterId && chapterRecords.some((chapter) => chapter.id === preferredChapterId)
          ? preferredChapterId
          : chapterRecords[0]?.id ?? null;
      const nextChapter = chapterRecords.find((chapter) => chapter.id === nextSelectedId) ?? null;

      setSelectedChapterId(nextSelectedId);
      setDraftHtml(nextChapter?.html ?? "");
      setSaveState(nextChapter ? "saved" : "idle");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "书籍加载失败。");
    } finally {
      setLoading(false);
    }
  }, [bookId, repository, router]);

  useEffect(() => {
    void loadWorkspace();
  }, [bookId, loadWorkspace]);

  const flushDraft = useCallback(async () => {
    const currentBook = bookRef.current;
    const currentChapter =
      chaptersRef.current.find((chapter) => chapter.id === selectedChapterIdRef.current) ?? null;
    const currentDraft = draftHtmlRef.current;

    if (!currentBook || !currentChapter) {
      return;
    }

    if (currentDraft === currentChapter.html) {
      return;
    }

    try {
      setSaveState("saving");
      const updatedChapter = await repository.updateChapterHtml(currentBook.id, currentChapter.id, currentDraft);
      setChapters((current) =>
        current.map((chapter) => (chapter.id === updatedChapter.id ? updatedChapter : chapter)),
      );
      setBook((current) => (current ? { ...current, updatedAt: updatedChapter.updatedAt } : current));
      setSaveState("saved");
    } catch (saveError) {
      setSaveState("error");
      setError(saveError instanceof Error ? saveError.message : "自动保存失败。");
    }
  }, [repository]);

  useEffect(() => {
    if (!selectedChapter) {
      return;
    }

    if (draftHtml === selectedChapter.html) {
      return;
    }

    setSaveState("dirty");
    const timeoutId = window.setTimeout(() => {
      void flushDraft();
    }, 800);

    return () => window.clearTimeout(timeoutId);
  }, [draftHtml, selectedChapter, flushDraft]);

  async function handleSelectChapter(chapterId: string) {
    await flushDraft();
    const nextChapter = chapters.find((chapter) => chapter.id === chapterId);
    setSelectedChapterId(chapterId);
    setDraftHtml(nextChapter?.html ?? "");
    setSaveState(nextChapter ? "saved" : "idle");
  }

  async function handleCreateChapter() {
    if (!book) {
      return;
    }

    try {
      await flushDraft();
      const chapter = await repository.createChapter(book.id);
      await loadWorkspace(chapter.id);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "创建章节失败。");
    }
  }

  async function handleRenameChapter(chapter: ChapterRecord) {
    setRenamingChapter(chapter);
    setChapterTitleDraft(chapter.title);
    setChapterTitleModalOpen(true);
  }

  async function handleDeleteChapter(chapter: ChapterRecord) {
    void modal.confirm({
      title: "删除章节",
      content: `确定删除章节《${chapter.title}》吗？`,
      okText: "确认删除",
      cancelText: "取消",
      okButtonProps: { danger: true },
      async onOk() {
        try {
          await repository.deleteChapter(chapter.bookId, chapter.id);
          const currentIndex = chaptersRef.current.findIndex((item) => item.id === chapter.id);
          const fallbackChapter =
            chaptersRef.current[currentIndex + 1] ?? chaptersRef.current[currentIndex - 1] ?? null;
          await loadWorkspace(fallbackChapter?.id ?? null);
          message.success("章节已删除。");
        } catch (deleteError) {
          setError(deleteError instanceof Error ? deleteError.message : "删除章节失败。");
          throw deleteError;
        }
      },
    });
  }

  async function handleMoveChapter(chapter: ChapterRecord, direction: "up" | "down") {
    try {
      await repository.moveChapter(chapter.bookId, chapter.id, direction);
      await loadWorkspace(chapter.id);
    } catch (moveError) {
      setError(moveError instanceof Error ? moveError.message : "调整章节顺序失败。");
    }
  }

  async function handleExportBook() {
    if (!book || chapters.length === 0) {
      return;
    }

    try {
      setExporting(true);
      await flushDraft();
      const [latestBook, latestChapters] = await Promise.all([
        repository.getBook(book.id),
        repository.listChapters(book.id),
      ]);

      const archive = await exportBookArchive(latestBook ?? book, latestChapters);
      downloadBlob(archive, formatArchiveName(book.title));
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "导出失败。");
    } finally {
      setExporting(false);
    }
  }

  async function handleRenameBook() {
    if (!book) {
      return;
    }

    try {
      const updatedBook = await repository.renameBook(book.id, bookTitleDraft);
      setBook(updatedBook);
      setBookTitleModalOpen(false);
      message.success("书名已更新。");
    } catch (renameError) {
      setError(renameError instanceof Error ? renameError.message : "修改书名失败。");
    }
  }

  async function handleConfirmRenameChapter() {
    if (!renamingChapter) {
      return;
    }

    try {
      await repository.renameChapter(renamingChapter.bookId, renamingChapter.id, chapterTitleDraft);
      setChapterTitleModalOpen(false);
      setRenamingChapter(null);
      await loadWorkspace(renamingChapter.id);
      message.success("章节标题已更新。");
    } catch (renameError) {
      setError(renameError instanceof Error ? renameError.message : "修改章节名失败。");
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#f5f8fd] dark:bg-[#0a1424]">
        <div className="rounded-3xl border border-blue-100 bg-white px-6 py-4 text-sm text-slate-600 shadow-sm dark:border-[#1e3556] dark:bg-[#0f1c31] dark:text-slate-300">
          正在打开书籍工作台...
        </div>
      </div>
    );
  }

  if (!book) {
    return null;
  }

  return (
    <div className="h-dvh overflow-hidden bg-[#f5f8fd] text-foreground dark:bg-[#0a1424]">
      <div className="mx-auto flex h-dvh max-w-[1600px] flex-col px-4 py-4 sm:px-6 lg:px-8">
        <header className="mb-3 rounded-[24px] border border-blue-100 bg-white px-4 py-3 shadow-sm dark:border-[#1e3556] dark:bg-[#0f1c31]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
            <Button asChild variant="outline" className="rounded-full border-blue-100 bg-white px-4 dark:border-[#24456d] dark:bg-[#12243e]">
              <Link href="/">
                <ArrowLeft className="size-4" />
                返回书架
              </Link>
            </Button>

              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                  书籍工作台
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white">
                    {book.title}
                  </h1>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 rounded-full border-blue-100 bg-white px-3 text-xs dark:border-[#24456d] dark:bg-[#12243e]"
                    onClick={() => {
                      setBookTitleDraft(book.title);
                      setBookTitleModalOpen(true);
                    }}
                  >
                    <BookOpenText className="size-3.5" />
                    修改书名
                  </Button>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs text-blue-700 dark:border-white/10 dark:bg-blue-400/10 dark:text-blue-200">
                {saveLabel(saveState)}
              </Badge>
              <Button
                variant="outline"
                className="rounded-full border-blue-100 bg-white dark:border-[#24456d] dark:bg-[#12243e]"
                onClick={() => void handleExportBook()}
                disabled={exporting || chapters.length === 0}
              >
                <Download className="size-4" />
                {exporting ? "导出中..." : "导出整本书"}
              </Button>
              <Button variant="outline" size="icon" className="h-10 w-10 rounded-full border-blue-100 bg-white dark:border-[#24456d] dark:bg-[#12243e]" onClick={toggleDark}>
                {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
              </Button>
            </div>
          </div>

        </header>

        {error ? (
          <div className="mb-4 rounded-[22px] border border-red-300/60 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-200">
            {error}
          </div>
        ) : null}

        <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[296px_minmax(0,1fr)]">
          <aside className="flex min-h-[320px] flex-col rounded-[28px] border border-blue-100 bg-[#f8fbff] p-3 shadow-sm dark:border-[#1e3556] dark:bg-[#0f1c31]">
            <div className="mb-3 flex items-center justify-between gap-3 px-2 pt-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                  章节管理
                </p>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                  {chapters.length === 0 ? "还没有章节" : `共 ${chapters.length} 章`}
                </p>
              </div>
              <Button className="rounded-full bg-blue-600 px-4 text-white hover:bg-blue-500" onClick={() => void handleCreateChapter()}>
                <Plus className="size-4" />
                新建
              </Button>
            </div>

            <div className="mt-2 flex-1 space-y-2 overflow-auto px-1 pb-1">
              {chapters.length === 0 ? (
                <div className="flex h-full min-h-[240px] flex-col items-center justify-center rounded-[22px] border border-dashed border-blue-200 bg-white px-4 text-center dark:border-[#24456d] dark:bg-[#12243e]">
                  <ListTree className="size-8 text-blue-300 dark:text-blue-300/70" />
                  <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
                    先创建第一章，再开始录入 HTML 内容。
                  </p>
                </div>
              ) : (
                chapters.map((chapter, index) => {
                  const selected = chapter.id === selectedChapterId;

                  return (
                    <div
                      key={chapter.id}
                      role="button"
                      tabIndex={0}
                      className={`w-full rounded-[22px] border px-3 py-3 text-left transition ${
                        selected
                          ? "border-blue-400 bg-blue-50 shadow-sm dark:border-blue-300/40 dark:bg-[#142744]"
                          : "border-transparent bg-white hover:border-blue-200 dark:bg-[#0f213a] dark:hover:border-[#24456d] dark:hover:bg-[#132845]"
                      }`}
                      onClick={() => void handleSelectChapter(chapter.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          void handleSelectChapter(chapter.id);
                        }
                      }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className={`text-[10px] font-semibold uppercase tracking-[0.24em] ${
                              selected ? "text-blue-700 dark:text-blue-200" : "text-slate-500 dark:text-slate-400"
                            }`}>
                              Chapter {index + 1}
                            </p>
                            {selected ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-semibold text-white dark:bg-blue-400 dark:text-[#0f1c31]">
                                <Check className="size-3" />
                                当前
                              </span>
                            ) : null}
                          </div>
                          <div className={`mt-1 line-clamp-2 text-sm font-semibold ${
                            selected ? "text-blue-950 dark:text-white" : "text-slate-900 dark:text-white"
                          }`}>
                            {chapter.title}
                          </div>
                        </div>

                        <div className="flex shrink-0 items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 rounded-full px-2 text-xs text-blue-600 hover:bg-blue-50 dark:text-blue-200 dark:hover:bg-blue-400/10"
                            onClick={(event) => {
                              event.stopPropagation();
                              void handleMoveChapter(chapter, "up");
                            }}
                            disabled={index === 0}
                          >
                            ↑
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 rounded-full px-2 text-xs text-blue-600 hover:bg-blue-50 dark:text-blue-200 dark:hover:bg-blue-400/10"
                            onClick={(event) => {
                              event.stopPropagation();
                              void handleMoveChapter(chapter, "down");
                            }}
                            disabled={index === chapters.length - 1}
                          >
                            ↓
                          </Button>
                        </div>
                      </div>

                      <div className="mt-3 flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                            className="h-8 rounded-full border-blue-100 bg-white px-3 text-xs dark:border-[#24456d] dark:bg-[#12243e]"
                          onClick={(event) => {
                            event.stopPropagation();
                            void handleRenameChapter(chapter);
                          }}
                        >
                          <PenSquare className="size-3.5" />
                          改名
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                            className="h-8 rounded-full border-blue-100 bg-white px-3 text-xs hover:border-red-300 hover:text-red-500 dark:border-[#24456d] dark:bg-[#12243e]"
                          onClick={(event) => {
                            event.stopPropagation();
                            void handleDeleteChapter(chapter);
                          }}
                        >
                          <Trash2 className="size-3.5" />
                          删除
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </aside>

          <section className="flex min-h-0 flex-col overflow-hidden rounded-[28px] border border-blue-100 bg-white shadow-sm dark:border-[#1e3556] dark:bg-[#0f1c31]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-blue-100 px-4 py-3 dark:border-[#1e3556]">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                  当前章节
                </p>
                <h2 className="mt-1 text-xl font-semibold text-slate-900 dark:text-white">
                  {selectedChapter?.title ?? "请选择章节"}
                </h2>
              </div>

              <div className="inline-flex rounded-full border border-blue-100 bg-blue-50 p-1 dark:border-white/10 dark:bg-[#132845]">
                <button
                  type="button"
                  className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                    panel === "edit"
                      ? "bg-white text-blue-700 shadow-sm dark:bg-[#0f1c31] dark:text-blue-200"
                      : "text-slate-500 dark:text-slate-300"
                  }`}
                  onClick={() => setPanel("edit")}
                >
                  编辑 HTML
                </button>
                <button
                  type="button"
                  className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                    panel === "preview"
                      ? "bg-white text-blue-700 shadow-sm dark:bg-[#0f1c31] dark:text-blue-200"
                      : "text-slate-500 dark:text-slate-300"
                  }`}
                  onClick={() => setPanel("preview")}
                >
                  预览 Markdown
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1">
              {selectedChapter ? (
                panel === "edit" ? (
                  <div className="flex h-full min-h-0 flex-col">
                    <div className="min-h-0 flex-1">
                      <HtmlEditor
                        value={draftHtml}
                        onChange={setDraftHtml}
                        onClear={() => setDraftHtml("")}
                        onOpenLinkImport={() => setLinkImportModalOpen(true)}
                      />
                    </div>
                  </div>
                ) : (
                  <MarkdownPreview markdown={liveMarkdown} title={selectedChapter.title} />
                )
              ) : (
                <div className="flex h-full flex-col items-center justify-center px-6 text-center">
                  <FileText className="size-10 text-blue-300 dark:text-blue-300/70" />
                  <h3 className="mt-4 text-xl font-semibold text-slate-900 dark:text-white">还没有可编辑的章节</h3>
                  <p className="mt-2 max-w-lg text-sm leading-7 text-slate-600 dark:text-slate-300">
                    新建章节后，你可以直接粘贴 HTML、上传 HTML 文件，或者通过上传文件旁的链接采集按钮抓取页面片段，再在预览模式下查看自动转换出的 Markdown。
                  </p>
                  <Button className="mt-5 rounded-full bg-blue-600 px-5 text-white hover:bg-blue-500" onClick={() => void handleCreateChapter()}>
                    <Plus className="size-4" />
                    新建第一章
                  </Button>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>

      <Modal
        title="修改书名"
        open={bookTitleModalOpen}
        okText="保存"
        cancelText="取消"
        onCancel={() => setBookTitleModalOpen(false)}
        onOk={() => void handleRenameBook()}
        destroyOnHidden
      >
        <div className="pt-2">
          <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">
            书名
          </label>
          <Input
            size="large"
            value={bookTitleDraft}
            onChange={(event) => setBookTitleDraft(event.target.value)}
            onPressEnter={() => void handleRenameBook()}
          />
        </div>
      </Modal>

      <Modal
        title="修改章节标题"
        open={chapterTitleModalOpen}
        okText="保存"
        cancelText="取消"
        onCancel={() => {
          setChapterTitleModalOpen(false);
          setRenamingChapter(null);
        }}
        onOk={() => void handleConfirmRenameChapter()}
        destroyOnHidden
      >
        <div className="pt-2">
          <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">
            章节标题
          </label>
          <Input
            size="large"
            value={chapterTitleDraft}
            onChange={(event) => setChapterTitleDraft(event.target.value)}
            onPressEnter={() => void handleConfirmRenameChapter()}
          />
        </div>
      </Modal>

      <Modal
        title="链接采集"
        open={linkImportModalOpen}
        footer={null}
        width={1200}
        onCancel={() => setLinkImportModalOpen(false)}
        destroyOnHidden
        styles={{ body: { padding: 0 } }}
      >
        <div className="h-[75vh] min-h-[560px]">
          <LinkImportPanel
            onImport={(html) => {
              setDraftHtml(html);
              setLinkImportModalOpen(false);
            }}
          />
        </div>
      </Modal>
    </div>
  );
}
