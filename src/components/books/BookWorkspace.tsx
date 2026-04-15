"use client";

import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { CSS } from "@dnd-kit/utilities";
import { App, Drawer, Input, Modal, Tooltip } from "antd";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChangeEvent, startTransition, useCallback, useDeferredValue, useEffect, useRef, useState } from "react";
import { ArrowLeft, BookOpenText, ChevronDown, ChevronUp, Copy, Download, FileText, Link2, ListTree, Moon, PenSquare, Plus, Sun, Trash2, Upload } from "lucide-react";
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

function formatChapterFileName(title: string): string {
  const baseName = title
    .normalize("NFKC")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return `${baseName || "未命名章节"}.md`;
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

interface ChapterCardProps {
  chapter: ChapterRecord;
  index: number;
  total: number;
  selected: boolean;
  onSelect: (chapterId: string) => void | Promise<void>;
  onMove: (chapter: ChapterRecord, direction: "up" | "down") => void | Promise<void>;
  onRename: (chapter: ChapterRecord) => void | Promise<void>;
  onDelete: (chapter: ChapterRecord) => void | Promise<void>;
}

function ChapterCard({ chapter, index, total, selected, onSelect, onMove, onRename, onDelete }: ChapterCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: chapter.id,
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={`relative w-full rounded-xl border px-3 py-2.5 text-left transition ${
        selected
          ? "border-blue-200 bg-white shadow-[0_8px_18px_-18px_rgba(37,99,235,0.35)] dark:border-blue-300/30 dark:bg-[#13213a]"
          : "border-transparent bg-transparent hover:border-slate-200 hover:bg-white/90 dark:hover:border-[#24456d] dark:hover:bg-[#13213a]"
      } ${isDragging ? "z-10 cursor-grabbing shadow-[0_10px_24px_-20px_rgba(15,23,42,0.35)] opacity-90 will-change-transform" : "cursor-grab active:cursor-grabbing"}`}
      onClick={() => void onSelect(chapter.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          void onSelect(chapter.id);
        }
      }}
      {...attributes}
      {...listeners}
    >
      <div
        className={`absolute bottom-2 left-0 top-2 w-1 rounded-r-full transition ${
          selected ? "bg-blue-500 dark:bg-blue-300" : "bg-transparent"
        }`}
      />

      <div className="pl-1">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span
              className={`inline-flex h-8 min-w-8 items-center justify-center rounded-full px-2 text-xs font-semibold ${
                selected
                  ? "bg-blue-50 text-blue-700 dark:bg-blue-400/15 dark:text-blue-200"
                  : "bg-slate-100 text-slate-500 dark:bg-white/5 dark:text-slate-400"
              }`}
            >
              {index + 1}
            </span>
          </div>

          <div
            className="mt-0.5 flex shrink-0 items-center gap-0.5"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            <Tooltip title="上移章节">
              <span className="inline-flex">
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 rounded-full text-slate-500 hover:bg-blue-50 hover:text-blue-600 dark:text-slate-300 dark:hover:bg-blue-400/10 dark:hover:text-blue-200"
                  onClick={() => void onMove(chapter, "up")}
                  disabled={index === 0}
                  aria-label="上移章节"
                >
                  <ChevronUp className="size-3.5" />
                </Button>
              </span>
            </Tooltip>
            <Tooltip title="下移章节">
              <span className="inline-flex">
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 rounded-full text-slate-500 hover:bg-blue-50 hover:text-blue-600 dark:text-slate-300 dark:hover:bg-blue-400/10 dark:hover:text-blue-200"
                  onClick={() => void onMove(chapter, "down")}
                  disabled={index === total - 1}
                  aria-label="下移章节"
                >
                  <ChevronDown className="size-3.5" />
                </Button>
              </span>
            </Tooltip>
            <Tooltip title="重命名章节">
              <span className="inline-flex">
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 rounded-full text-slate-500 hover:bg-white hover:text-slate-900 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white"
                  onClick={() => void onRename(chapter)}
                >
                  <PenSquare className="size-3.5" />
                </Button>
              </span>
            </Tooltip>
            <Tooltip title="删除章节">
              <span className="inline-flex">
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 rounded-full text-slate-500 hover:bg-red-50 hover:text-red-500 dark:text-slate-300 dark:hover:bg-red-500/10 dark:hover:text-red-300"
                  onClick={() => void onDelete(chapter)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </span>
            </Tooltip>
          </div>
        </div>

        <div
          className={`mt-3 w-full text-[15px] font-semibold leading-7 ${
            selected ? "text-blue-950 dark:text-white" : "text-slate-900 dark:text-white"
          }`}
        >
          <div className="line-clamp-2 w-full break-words">{chapter.title}</div>
        </div>
      </div>
    </div>
  );
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
  const [copiedMarkdown, setCopiedMarkdown] = useState(false);
  const deferredHtml = useDeferredValue(draftHtml);
  const selectedChapter = chapters.find((chapter) => chapter.id === selectedChapterId) ?? null;
  const liveMarkdown = deferredHtml.trim() === "" ? "" : convert(deferredHtml);
  const bookRef = useRef(book);
  const chaptersRef = useRef(chapters);
  const selectedChapterIdRef = useRef(selectedChapterId);
  const draftHtmlRef = useRef(draftHtml);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6,
      },
    }),
  );

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
      const reorderedChapters = await repository.moveChapter(chapter.bookId, chapter.id, direction);
      setChapters(reorderedChapters);
      setBook((current) =>
        current
          ? {
              ...current,
              updatedAt: reorderedChapters[0]?.updatedAt ?? current.updatedAt,
            }
          : current,
      );
    } catch (moveError) {
      setError(moveError instanceof Error ? moveError.message : "调整章节顺序失败。");
    }
  }

  async function handleDragChapterEnd(event: DragEndEvent) {
    if (!book) {
      return;
    }

    const { active, over } = event;

    if (!over || active.id === over.id) {
      return;
    }

    const currentChapters = chaptersRef.current;
    const oldIndex = currentChapters.findIndex((chapter) => chapter.id === active.id);
    const newIndex = currentChapters.findIndex((chapter) => chapter.id === over.id);

    if (oldIndex === -1 || newIndex === -1) {
      return;
    }

    const nextChapters = arrayMove(currentChapters, oldIndex, newIndex).map((chapter, index) => ({
      ...chapter,
      order: index,
    }));

    setChapters(nextChapters);

    try {
      const savedChapters = await repository.reorderChapters(
        book.id,
        nextChapters.map((chapter) => chapter.id),
      );
      setChapters(savedChapters);
      setBook((current) =>
        current
          ? {
              ...current,
              updatedAt: savedChapters[0]?.updatedAt ?? current.updatedAt,
            }
          : current,
      );
      message.success("章节顺序已更新。");
    } catch (moveError) {
      setError(moveError instanceof Error ? moveError.message : "调整章节顺序失败。");
      await loadWorkspace(selectedChapterIdRef.current);
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

  async function handleImportHtmlFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    try {
      setDraftHtml(await file.text());
    } catch (fileError) {
      setError(fileError instanceof Error ? fileError.message : "读取 HTML 文件失败。");
    }
  }

  async function handleCopyMarkdown() {
    if (!liveMarkdown) {
      return;
    }

    await navigator.clipboard.writeText(liveMarkdown);
    setCopiedMarkdown(true);
    window.setTimeout(() => setCopiedMarkdown(false), 2000);
  }

  function handleDownloadMarkdown() {
    if (!selectedChapter || !liveMarkdown) {
      return;
    }

    const blob = new Blob([liveMarkdown], { type: "text/markdown;charset=utf-8" });
    downloadBlob(blob, formatChapterFileName(selectedChapter.title));
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
    <div className="h-dvh overflow-hidden bg-[#f7f8fb] text-foreground dark:bg-[#0a1220]">
      <div className="flex h-dvh w-full flex-col">
        <header className="border-b border-slate-200/80 bg-white/96 px-4 py-3 backdrop-blur dark:border-[#1a2a45] dark:bg-[#0d182a]/96 sm:px-5 lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Button asChild variant="outline" className="rounded-full border-slate-200 bg-white px-4 dark:border-[#213553] dark:bg-[#12243e]">
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
                    className="h-8 rounded-full border-slate-200 bg-white px-3 text-xs dark:border-[#213553] dark:bg-[#12243e]"
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
              <Badge variant="secondary" className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-700 dark:border-white/10 dark:bg-blue-400/10 dark:text-blue-200">
                {saveLabel(saveState)}
              </Badge>
              <Button
                variant="outline"
                className="rounded-full border-slate-200 bg-white dark:border-[#213553] dark:bg-[#12243e]"
                onClick={() => void handleExportBook()}
                disabled={exporting || chapters.length === 0}
              >
                <Download className="size-4" />
                {exporting ? "导出中..." : "导出整本书"}
              </Button>
              <Tooltip title={dark ? "切换浅色模式" : "切换深色模式"}>
                <span className="inline-flex">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-10 w-10 rounded-full border-slate-200 bg-white dark:border-[#213553] dark:bg-[#12243e]"
                    onClick={toggleDark}
                  >
                    {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
                  </Button>
                </span>
              </Tooltip>
            </div>
          </div>
        </header>

        {error ? (
          <div className="border-b border-red-300/60 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-200 sm:px-5 lg:px-8">
            {error}
          </div>
        ) : null}

        <div className="grid min-h-0 flex-1 grid-rows-[minmax(240px,34vh)_minmax(0,1fr)] lg:grid-cols-[280px_minmax(0,1fr)] lg:grid-rows-1">
          <aside className="flex min-h-0 flex-col overflow-hidden border-b border-slate-200 bg-[#f6f8fc] dark:border-[#1a2a45] dark:bg-[#0e1728] lg:border-b-0 lg:border-r">
            <div className="flex min-h-[60px] items-center justify-between gap-2 border-b border-slate-200/80 px-4 py-2 dark:border-[#1a2a45] lg:min-h-[62px]">
              <div className="flex min-w-0 items-center gap-2.5">
                <p className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                  章节管理
                </p>
                <p className="truncate text-xs text-slate-600 dark:text-slate-300">
                  {chapters.length === 0 ? "还没有章节" : `共 ${chapters.length} 章`}
                </p>
              </div>
              <Button className="h-9 rounded-full bg-blue-600 px-3.5 text-sm text-white hover:bg-blue-500" onClick={() => void handleCreateChapter()}>
                <Plus className="size-4" />
                新建
              </Button>
            </div>

            <div className="flex-1 overflow-auto px-3 py-3">
              {chapters.length === 0 ? (
                <div className="flex h-full min-h-[200px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white px-4 text-center dark:border-[#24456d] dark:bg-[#12243e]">
                  <ListTree className="size-8 text-blue-300 dark:text-blue-300/70" />
                  <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
                    先创建第一章，再开始录入 HTML 内容。
                  </p>
                </div>
              ) : (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  modifiers={[restrictToVerticalAxis]}
                  onDragEnd={(event) => void handleDragChapterEnd(event)}
                >
                  <SortableContext items={chapters.map((chapter) => chapter.id)} strategy={verticalListSortingStrategy}>
                    <div className="space-y-1.5">
                      {chapters.map((chapter, index) => (
                        <ChapterCard
                          key={chapter.id}
                          chapter={chapter}
                          index={index}
                          total={chapters.length}
                          selected={chapter.id === selectedChapterId}
                          onSelect={handleSelectChapter}
                          onMove={handleMoveChapter}
                          onRename={handleRenameChapter}
                          onDelete={handleDeleteChapter}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              )}
            </div>
          </aside>

          <section className="flex min-h-0 flex-col overflow-hidden bg-white dark:bg-[#0b1220]">
            <div className="flex min-h-[60px] flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 bg-white px-4 py-2 dark:border-[#1a2a45] dark:bg-[#0d182a] lg:min-h-[62px] lg:px-8">
              <div className="min-w-0">
                <h2 className="truncate text-base font-semibold text-slate-900 dark:text-white lg:text-lg">
                  {selectedChapter?.title ?? "请选择章节"}
                </h2>
              </div>

              <div className="inline-flex items-center gap-0.5 rounded-full border border-slate-200 bg-slate-50/90 p-0.5 dark:border-white/10 dark:bg-[#132845]">
                {panel === "edit" ? (
                  <>
                    <Tooltip title="上传 HTML 文件">
                      <span className="inline-flex">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 rounded-full text-slate-500 hover:bg-white hover:text-slate-900 dark:text-slate-300 dark:hover:bg-[#0f1c31] dark:hover:text-white"
                          onClick={() => importInputRef.current?.click()}
                          disabled={!selectedChapter}
                          aria-label="上传 HTML 文件"
                        >
                          <Upload className="size-3.5" />
                        </Button>
                      </span>
                    </Tooltip>
                    <Tooltip title="链接采集">
                      <span className="inline-flex">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 rounded-full text-slate-500 hover:bg-white hover:text-slate-900 dark:text-slate-300 dark:hover:bg-[#0f1c31] dark:hover:text-white"
                          onClick={() => setLinkImportModalOpen(true)}
                          disabled={!selectedChapter}
                          aria-label="链接采集"
                        >
                          <Link2 className="size-3.5" />
                        </Button>
                      </span>
                    </Tooltip>
                    <Tooltip title="清空 HTML">
                      <span className="inline-flex">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 rounded-full text-slate-500 hover:bg-red-50 hover:text-red-500 dark:text-slate-300 dark:hover:bg-red-500/10 dark:hover:text-red-300"
                          onClick={() => setDraftHtml("")}
                          disabled={!selectedChapter || !draftHtml}
                          aria-label="清空 HTML"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </span>
                    </Tooltip>
                  </>
                ) : (
                  <>
                    <Tooltip title={copiedMarkdown ? "已复制 Markdown" : "复制 Markdown"}>
                      <span className="inline-flex">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 rounded-full text-slate-500 hover:bg-white hover:text-slate-900 dark:text-slate-300 dark:hover:bg-[#0f1c31] dark:hover:text-white"
                          onClick={() => void handleCopyMarkdown()}
                          disabled={!selectedChapter || !liveMarkdown}
                          aria-label={copiedMarkdown ? "已复制 Markdown" : "复制 Markdown"}
                        >
                          <Copy className="size-3.5" />
                        </Button>
                      </span>
                    </Tooltip>
                    <Tooltip title="下载 Markdown">
                      <span className="inline-flex">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 rounded-full text-slate-500 hover:bg-white hover:text-slate-900 dark:text-slate-300 dark:hover:bg-[#0f1c31] dark:hover:text-white"
                          onClick={handleDownloadMarkdown}
                          disabled={!selectedChapter || !liveMarkdown}
                          aria-label="下载 Markdown"
                        >
                          <Download className="size-3.5" />
                        </Button>
                      </span>
                    </Tooltip>
                  </>
                )}
              </div>
            </div>

            <div className="min-h-0 flex-1">
              {selectedChapter ? (
                panel === "edit" ? (
                  <div className="flex h-full min-h-0 flex-col">
                    <div className="min-h-0 flex-1">
                      <HtmlEditor value={draftHtml} onChange={setDraftHtml} />
                    </div>
                  </div>
                ) : (
                  <MarkdownPreview markdown={liveMarkdown} />
                )
              ) : (
                <div className="flex h-full flex-col items-center justify-center px-6 text-center lg:px-10">
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

            <div className="bg-transparent px-4 pb-4 pt-2 lg:px-8">
              <div className="grid items-center gap-2 sm:grid-cols-[1fr_auto_1fr]">
                <div className="hidden sm:block" />

                <div className="justify-self-center">
                  <div className="inline-flex rounded-full border border-slate-200 bg-white/92 p-1 shadow-[0_10px_30px_-24px_rgba(15,23,42,0.45)] backdrop-blur dark:border-white/10 dark:bg-[#132845]/92 dark:shadow-[0_14px_36px_-24px_rgba(0,0,0,0.7)]">
                    <Button
                      type="button"
                      variant={panel === "edit" ? "default" : "ghost"}
                      className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                        panel === "edit"
                          ? "bg-slate-900 text-white hover:bg-slate-900 dark:bg-white dark:text-[#0f1c31] dark:hover:bg-white"
                          : "text-slate-500 dark:text-slate-300"
                      }`}
                      onClick={() => setPanel("edit")}
                    >
                      编辑 HTML
                    </Button>
                    <Button
                      type="button"
                      variant={panel === "preview" ? "default" : "ghost"}
                      className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                        panel === "preview"
                          ? "bg-slate-900 text-white hover:bg-slate-900 dark:bg-white dark:text-[#0f1c31] dark:hover:bg-white"
                          : "text-slate-500 dark:text-slate-300"
                      }`}
                      onClick={() => setPanel("preview")}
                    >
                      预览 Markdown
                    </Button>
                  </div>
                </div>

                <div className="justify-self-center sm:justify-self-end">
                  <div className="inline-flex items-center gap-3 rounded-full border border-slate-200 bg-white/92 px-3 py-2 text-xs text-slate-500 shadow-[0_10px_30px_-24px_rgba(15,23,42,0.45)] backdrop-blur dark:border-white/10 dark:bg-[#132845]/92 dark:text-slate-300 dark:shadow-[0_14px_36px_-24px_rgba(0,0,0,0.7)]">
                    {panel === "edit" ? (
                      <>
                        <span>{draftHtml.length.toLocaleString()} 字符</span>
                        <span>UTF-8</span>
                      </>
                    ) : (
                      <>
                        <span>{liveMarkdown ? `${liveMarkdown.split("\n").length} 行` : "空"}</span>
                        <span>Markdown</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>

      <input
        ref={importInputRef}
        type="file"
        accept=".html,.htm"
        className="hidden"
        onChange={(event) => void handleImportHtmlFile(event)}
      />

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

      <Drawer
        title="链接采集"
        open={linkImportModalOpen}
        placement="right"
        width="min(960px, 100vw)"
        onClose={() => setLinkImportModalOpen(false)}
        destroyOnHidden
        styles={{
          content: {
            overflow: "hidden",
          },
          body: {
            padding: 0,
            height: "calc(100dvh - 55px)",
            overflow: "hidden",
          },
        }}
      >
        <div className="h-full min-h-0">
          <LinkImportPanel
            onImport={(html) => {
              setDraftHtml(html);
              setLinkImportModalOpen(false);
            }}
          />
        </div>
      </Drawer>
    </div>
  );
}
