"use client";

import { App, Input, Tooltip, Typography } from "antd";
import { ChevronLeft, ChevronUp, ExternalLink, FileSearch, LoaderCircle, MousePointerClick, RefreshCw, SquareMousePointer, WandSparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import FrameRender from "@/components/FrameRender";
import { Button } from "@/components/ui/button";
import {
  buildProxyPageUrl,
  getTargetUrlFromProxyPageUrl,
  getTargetUrlFromProxyResourceUrl,
  normalizeTargetUrl,
  resolveTargetUrl,
} from "@/lib/proxy";

interface Props {
  onImport: (html: string) => void;
}

type ImportStatus = "idle" | "loading" | "loaded" | "error";

interface PickedLevel {
  html: string;
  tagName: string;
  path: string;
}

interface PreviewFragment {
  mode: "picked" | "extracted";
  html: string;
  path?: string;
  pickedLevels?: PickedLevel[];
  pickedLevelIndex?: number;
}

type ElementPickerConstructor = typeof import("pick-dom-element").ElementPicker;

interface FramePickerWindow extends Window {
  __HTML2MD_PICKER__?: {
    ElementPicker?: ElementPickerConstructor;
  };
  __HTML2MD_PICKER_LOADING__?: Promise<void>;
}

const FRAME_PICKER_LOADER_PATH = "/vendor/pick-dom-element/frame-loader.js";
const RESTORABLE_ATTRIBUTES: Array<{ selector: string; attribute: "src" | "href" | "poster" | "data" | "action"; originalAttribute?: string }> = [
  { selector: "img[src]", attribute: "src" },
  { selector: "script[src]", attribute: "src" },
  { selector: "iframe[src]", attribute: "src" },
  { selector: "embed[src]", attribute: "src" },
  { selector: "source[src]", attribute: "src" },
  { selector: "track[src]", attribute: "src" },
  { selector: "audio[src]", attribute: "src" },
  { selector: "video[src]", attribute: "src" },
  { selector: "video[poster]", attribute: "poster" },
  { selector: "object[data]", attribute: "data" },
  { selector: "link[href]", attribute: "href" },
  { selector: "a[href]", attribute: "href", originalAttribute: "data-html2md-original-href" },
  { selector: "form[action]", attribute: "action", originalAttribute: "data-html2md-original-action" },
];

function shouldKeepLiteralUrl(value: string): boolean {
  return (
    value === "" ||
    value.startsWith("#") ||
    value.startsWith("data:") ||
    value.startsWith("javascript:") ||
    value.startsWith("mailto:") ||
    value.startsWith("tel:")
  );
}

function restoreOriginalFragmentHtml(fragmentHtml: string, pageUrl: string, appOrigin: string): string {
  const parser = new DOMParser();
  const document = parser.parseFromString(`<body>${fragmentHtml}</body>`, "text/html");

  for (const rule of RESTORABLE_ATTRIBUTES) {
    document.body.querySelectorAll(rule.selector).forEach((element) => {
      const attributeValue = element.getAttribute(rule.attribute);
      const originalValue = rule.originalAttribute ? element.getAttribute(rule.originalAttribute) : null;

      if (originalValue) {
        const restoredValue = shouldKeepLiteralUrl(originalValue) ? originalValue : resolveTargetUrl(originalValue, pageUrl);
        element.setAttribute(rule.attribute, restoredValue);
      } else if (attributeValue) {
        const restoredValue =
          getTargetUrlFromProxyResourceUrl(attributeValue, appOrigin) ?? getTargetUrlFromProxyPageUrl(attributeValue, appOrigin);

        if (restoredValue) {
          element.setAttribute(rule.attribute, restoredValue);
        }
      }

      if (rule.originalAttribute) {
        element.removeAttribute(rule.originalAttribute);
      }
    });
  }

  document.body.querySelectorAll("[srcset]").forEach((element) => {
    const srcset = element.getAttribute("srcset");

    if (!srcset) {
      return;
    }

    const restoredSrcset = srcset
      .split(",")
      .map((entry) => {
        const trimmed = entry.trim();

        if (trimmed === "") {
          return trimmed;
        }

        const [urlPart, descriptor] = trimmed.split(/\s+/, 2);
        const restoredUrl = getTargetUrlFromProxyResourceUrl(urlPart, appOrigin) ?? urlPart;
        return descriptor ? `${restoredUrl} ${descriptor}` : restoredUrl;
      })
      .join(", ");

    element.setAttribute("srcset", restoredSrcset);
  });

  document.body.querySelectorAll("[data-html2md-original-href], [data-html2md-original-action]").forEach((element) => {
    element.removeAttribute("data-html2md-original-href");
    element.removeAttribute("data-html2md-original-action");
  });

  return document.body.innerHTML;
}

function formatElementSegment(element: Element): string {
  const tagName = element.tagName.toLowerCase();
  const id = element.id ? `#${element.id}` : "";
  const classNames = Array.from(element.classList).slice(0, 3).map((name) => `.${name}`).join("");
  const parent = element.parentElement;

  if (!parent) {
    return `${tagName}${id}${classNames}`;
  }

  const sameTagSiblings = Array.from(parent.children).filter((child) => child.tagName === element.tagName);
  const position =
    sameTagSiblings.length > 1 ? `:nth-of-type(${sameTagSiblings.indexOf(element) + 1})` : "";

  return `${tagName}${id}${classNames}${position}`;
}

function buildPickedLevels(element: Element, pageUrl: string, appOrigin: string): PickedLevel[] {
  const levels: PickedLevel[] = [];
  const ancestors: Element[] = [];
  let current: Element | null = element;

  while (current && current.tagName) {
    const tagName = current.tagName.toLowerCase();

    if (["html", "head"].includes(tagName)) {
      break;
    }

    ancestors.unshift(current);

    if (tagName === "body") {
      break;
    }

    current = current.parentElement;
  }

  for (let index = ancestors.length - 1; index >= 0; index -= 1) {
    const target = ancestors[index];
    const path = ancestors.slice(0, index + 1).map(formatElementSegment).join(" > ");
    levels.push({
      html: restoreOriginalFragmentHtml(target.outerHTML || "", pageUrl, appOrigin),
      tagName: target.tagName.toLowerCase(),
      path,
    });
  }

  return levels;
}

export default function LinkImportPanel({ onImport }: Props) {
  const { message } = App.useApp();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const pickerRef = useRef<{ stop: () => void } | null>(null);
  const readyTimeoutRef = useRef<number | null>(null);
  const [urlDraft, setUrlDraft] = useState("");
  const [loadedUrl, setLoadedUrl] = useState("");
  const [status, setStatus] = useState<ImportStatus>("idle");
  const [error, setError] = useState("");
  const [picking, setPicking] = useState(false);
  const [previewFragment, setPreviewFragment] = useState<PreviewFragment | null>(null);
  const [frameHtml, setFrameHtml] = useState("");
  const [frameKey, setFrameKey] = useState(0);
  const [extracting, setExtracting] = useState(false);

  const helperText = useMemo(() => {
    if (status === "loading") {
      return "正在加载代理页面...";
    }

    if (status === "loaded") {
      return "页面已就绪，可直接提取正文或进入选取。";
    }

    if (extracting) {
      return "正在提取正文...";
    }

    return "优先提取正文；需要局部内容时，先加载页面，再进入选取。";
  }, [extracting, status]);

  useEffect(() => {
    return () => {
      if (readyTimeoutRef.current !== null) {
        window.clearTimeout(readyTimeoutRef.current);
      }
      stopPicking();
    };
  }, []);

  async function loadRemotePage(urlInput?: string) {
    try {
      setStatus("loading");
      setError("");
      setPreviewFragment(null);
      stopPicking();

      const normalizedUrl = normalizeTargetUrl(urlInput ?? urlDraft);
      const entryUrl = buildProxyPageUrl(normalizedUrl, window.location.origin);
      const previewResponse = await fetch(entryUrl, {
        headers: {
          accept: "text/html",
        },
      });

      if (!previewResponse.ok) {
        let messageText = `代理页面加载失败：${previewResponse.status}`;

        try {
          const payload = (await previewResponse.json()) as { error?: string };
          if (payload.error) {
            messageText = payload.error;
          }
        } catch {}

        throw new Error(messageText);
      }

      const previewHtml = await previewResponse.text();
      setLoadedUrl(normalizedUrl);
      setUrlDraft(normalizedUrl);
      setFrameHtml(previewHtml);
      setFrameKey((value) => value + 1);

      if (readyTimeoutRef.current !== null) {
        window.clearTimeout(readyTimeoutRef.current);
      }

      readyTimeoutRef.current = window.setTimeout(() => {
        setStatus("error");
        setError("代理 iframe 未能在预期时间内完成加载。目标站点脚本可能执行失败，或页面不适合被完整代理。");
      }, 12000);
    } catch (loadError) {
      setStatus("error");
      setError(loadError instanceof Error ? loadError.message : "代理页面加载失败。");
    }
  }

  async function extractRemotePage(urlInput?: string) {
    try {
      setExtracting(true);
      setError("");
      setPreviewFragment(null);
      stopPicking();

      const normalizedUrl = normalizeTargetUrl(urlInput ?? urlDraft);
      const response = await fetch(`/api/proxy/extract?url=${encodeURIComponent(normalizedUrl)}`, {
        headers: {
          accept: "application/json",
        },
      });

      if (!response.ok) {
        let messageText = `正文提取失败：${response.status}`;

        try {
          const payload = (await response.json()) as { error?: string };
          if (payload.error) {
            messageText = payload.error;
          }
        } catch {}

        throw new Error(messageText);
      }

      const payload = (await response.json()) as { html: string; title?: string };
      setLoadedUrl(normalizedUrl);
      setUrlDraft(normalizedUrl);
      setPreviewFragment({
        mode: "extracted",
        html: payload.html,
      });
      message.success(payload.title ? `已提取正文：${payload.title}` : "已提取正文内容，请确认后导入。");
    } catch (extractError) {
      setError(extractError instanceof Error ? extractError.message : "正文提取失败。");
    } finally {
      setExtracting(false);
    }
  }

  function stopPicking() {
    pickerRef.current?.stop();
    pickerRef.current = null;
    setPicking(false);
  }

  async function ensureFramePicker(iframe: HTMLIFrameElement): Promise<ElementPickerConstructor> {
    const frameWindow = iframe.contentWindow as FramePickerWindow | null;
    const doc = iframe.contentDocument;

    if (!frameWindow || !doc) {
      throw new Error("代理页面尚未准备好，暂时无法初始化选取器。");
    }

    if (frameWindow.__HTML2MD_PICKER__?.ElementPicker) {
      return frameWindow.__HTML2MD_PICKER__.ElementPicker;
    }

    if (!frameWindow.__HTML2MD_PICKER_LOADING__) {
      frameWindow.__HTML2MD_PICKER_LOADING__ = new Promise<void>((resolve, reject) => {
        const script = doc.createElement("script");
        script.type = "module";
        script.src = new URL(FRAME_PICKER_LOADER_PATH, window.location.origin).toString();
        script.dataset.html2mdPickerLoader = "true";
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("iframe 选取器脚本加载失败。"));
        (doc.head || doc.documentElement).appendChild(script);
      });
    }

    await frameWindow.__HTML2MD_PICKER_LOADING__;

    if (!frameWindow.__HTML2MD_PICKER__?.ElementPicker) {
      throw new Error("iframe 选取器未能正确初始化。");
    }

    return frameWindow.__HTML2MD_PICKER__.ElementPicker;
  }

  async function startPicking() {
    try {
      const iframe = iframeRef.current;
      const doc = iframe?.contentDocument;

      if (!iframe?.contentWindow || !doc?.documentElement) {
        throw new Error("代理页面尚未准备好，暂时无法选取。");
      }

      stopPicking();
      setError("");

      const ElementPicker = await ensureFramePicker(iframe);
      const picker = new ElementPicker({
        style: {
          background: "rgba(37, 99, 235, 0.18)",
          borderColor: "#2563eb",
          borderRadius: "4px",
          borderWidth: "2px",
        },
      });
      const started = picker.start({
        parentElement: doc.documentElement,
        useShadowDOM: true,
        elementFilter: (element) => {
          const tagName = element.tagName?.toLowerCase();

          if (!tagName) {
            return false;
          }

          return !["html", "head", "body", "script", "style", "noscript", "link", "meta", "title"].includes(tagName);
        },
        onClick: (element) => {
          picker.stop();
          pickerRef.current = null;
          setPicking(false);
          const pageUrl = loadedUrl || iframe.contentWindow?.location.href || window.location.href;
          const pickedLevels = buildPickedLevels(element, pageUrl, window.location.origin);
          const nextPickedLevel = pickedLevels[0];

          if (!nextPickedLevel) {
            throw new Error("当前元素无法生成可预览的标签路径。");
          }

          setPreviewFragment({
            mode: "picked",
            html: nextPickedLevel.html,
            path: nextPickedLevel.path,
            pickedLevels,
            pickedLevelIndex: 0,
          });
        },
      });

      if (!started) {
        throw new Error("页面选取器启动失败。");
      }

      pickerRef.current = picker;
      setPicking(true);
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : "启动页面选取器失败。");
      setPicking(false);
    }
  }

  function handleFrameLoad() {
    if (!frameHtml) {
      return;
    }

    stopPicking();

    if (readyTimeoutRef.current !== null) {
      window.clearTimeout(readyTimeoutRef.current);
      readyTimeoutRef.current = null;
    }

    setStatus("loaded");
    setError("");
  }

  function handleFrameError() {
    stopPicking();

    if (readyTimeoutRef.current !== null) {
      window.clearTimeout(readyTimeoutRef.current);
      readyTimeoutRef.current = null;
    }

    setStatus("error");
    setError("代理 iframe 加载失败。");
  }

  function applyPreviewFragment() {
    if (!previewFragment) {
      return;
    }

    onImport(previewFragment.html);
    message.success(previewFragment.mode === "picked" ? "已导入选取内容。" : "已导入提取出的正文内容。");
  }

  function movePickedLevel(direction: "parent" | "child") {
    setPreviewFragment((current) => {
      if (!current || current.mode !== "picked" || !current.pickedLevels || current.pickedLevelIndex === undefined) {
        return current;
      }

      const nextIndex =
        direction === "parent"
          ? Math.min(current.pickedLevelIndex + 1, current.pickedLevels.length - 1)
          : Math.max(current.pickedLevelIndex - 1, 0);

      const nextLevel = current.pickedLevels[nextIndex];

      if (!nextLevel) {
        return current;
      }

      return {
        ...current,
        html: nextLevel.html,
        path: nextLevel.path,
        pickedLevelIndex: nextIndex,
      };
    });
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-white dark:bg-[#0b1220]">
      <div className="border-b border-slate-200 bg-white px-5 py-3 dark:border-[#1a2a45] dark:bg-[#0d182a]">
        <div className="flex min-w-0 flex-col gap-2 lg:flex-row lg:items-center">
          <Input
            size="middle"
            value={urlDraft}
            placeholder="输入网页链接，例如 https://example.com/article"
            onChange={(event) => setUrlDraft(event.target.value)}
            onPressEnter={() => void loadRemotePage()}
            className="w-full min-w-0 flex-1"
          />
          <div className="flex min-w-0 flex-wrap items-center gap-2 lg:flex-nowrap">
            <Tooltip title="把目标网页载入 iframe，适合后续点选局部内容。" placement="top">
              <span>
                <Button
                  type="button"
                  className="h-9 rounded-full bg-blue-600 px-3.5 text-sm text-white hover:bg-blue-500"
                  disabled={status === "loading" || extracting}
                  onClick={() => void loadRemotePage()}
                >
                  {status === "loading" ? <LoaderCircle className="size-4 animate-spin" /> : <ExternalLink className="size-4" />}
                  加载
                </Button>
              </span>
            </Tooltip>
            <Tooltip title="直接抽取文章主体，适合大多数博客、资讯和教程页面。" placement="top">
              <span>
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 rounded-full border-blue-100 bg-white px-3.5 text-sm dark:border-[#24456d] dark:bg-[#0f1c31]"
                  disabled={status === "loading" || extracting}
                  onClick={() => void extractRemotePage()}
                >
                  {extracting ? <LoaderCircle className="size-4 animate-spin" /> : <FileSearch className="size-4" />}
                  提取
                </Button>
              </span>
            </Tooltip>
            <Tooltip title="在 iframe 中点选页面元素，适合只导入某一块内容。" placement="top">
              <span>
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 rounded-full border-blue-100 bg-white px-3.5 text-sm dark:border-[#24456d] dark:bg-[#0f1c31]"
                  disabled={status !== "loaded" || picking || extracting}
                  onClick={() => void startPicking()}
                >
                  <SquareMousePointer className="size-4" />
                  选取
                </Button>
              </span>
            </Tooltip>
            <Tooltip title="停止当前点选模式，保留已加载页面。" placement="top">
              <span>
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 rounded-full border-blue-100 bg-white px-3.5 text-sm dark:border-[#24456d] dark:bg-[#0f1c31]"
                  disabled={!picking}
                  onClick={stopPicking}
                >
                  <MousePointerClick className="size-4" />
                  停止
                </Button>
              </span>
            </Tooltip>
          </div>
        </div>
        <div className="mt-2 flex min-h-5 min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <Typography.Text className="block min-w-0 flex-1 text-[11px] leading-5 text-slate-500 dark:text-slate-400">
            {helperText}
          </Typography.Text>
          {loadedUrl ? (
            <Typography.Text className="max-w-full truncate rounded-full bg-slate-100 px-2 py-0.5 text-[11px] leading-5 text-slate-400 dark:bg-white/5 dark:text-slate-500 lg:max-w-[48%]">
              {loadedUrl}
            </Typography.Text>
          ) : null}
        </div>
        {error ? (
          <div className="mt-2 rounded-xl border border-red-300/60 bg-red-50 px-3 py-2 text-[11px] leading-5 text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-200">
            {error}
          </div>
        ) : null}
      </div>

      <div className="min-h-0 min-w-0 flex-1 overflow-hidden bg-[#f4f7fb] p-3 dark:bg-[#0b1220]">
        {previewFragment ? (
          <div className="flex h-full min-h-[320px] min-w-0 flex-col overflow-hidden border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:border-[#1a2a45] dark:bg-[#101a2d]">
            <div className="border-b border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-[#1a2a45] dark:bg-[#0d182a]">
              {previewFragment.mode === "picked" && previewFragment.path ? (
                <div className="mb-2 max-h-20 overflow-auto border border-slate-200 bg-white px-3 py-1.5 font-mono text-[11px] leading-5 text-slate-600 break-all dark:border-[#1a2a45] dark:bg-[#0b1220] dark:text-slate-300">
                  {previewFragment.path}
                </div>
              ) : null}
              <div className="flex flex-wrap items-center justify-end gap-2">
                {previewFragment.mode === "extracted" ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-8 rounded-full border-slate-200 bg-white px-3.5 text-sm dark:border-[#24456d] dark:bg-[#0f1c31]"
                    disabled={extracting}
                    onClick={() => void extractRemotePage()}
                  >
                    <RefreshCw className="size-4" />
                    重新提取
                  </Button>
                ) : (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-8 rounded-full border-slate-200 bg-white px-3.5 text-sm dark:border-[#24456d] dark:bg-[#0f1c31]"
                      onClick={() => setPreviewFragment(null)}
                    >
                      <ChevronLeft className="size-4" />
                      返回选取
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-8 rounded-full border-slate-200 bg-white px-3.5 text-sm dark:border-[#24456d] dark:bg-[#0f1c31]"
                      disabled={(previewFragment.pickedLevelIndex ?? 0) <= 0}
                      onClick={() => movePickedLevel("child")}
                    >
                      <RefreshCw className="size-4" />
                      选择子级
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-8 rounded-full border-slate-200 bg-white px-3.5 text-sm dark:border-[#24456d] dark:bg-[#0f1c31]"
                      disabled={
                        !previewFragment.pickedLevels ||
                        (previewFragment.pickedLevelIndex ?? 0) >= previewFragment.pickedLevels.length - 1
                      }
                      onClick={() => movePickedLevel("parent")}
                    >
                      <ChevronUp className="size-4" />
                      选择父级
                    </Button>
                  </>
                )}
                <Button
                  type="button"
                  className="h-8 rounded-full bg-blue-600 px-3.5 text-sm text-white hover:bg-blue-500"
                  onClick={applyPreviewFragment}
                >
                  <WandSparkles className="size-4" />
                  导入正文
                </Button>
              </div>
            </div>
            <div
              className="link-import-preview min-h-0 min-w-0 flex-1 overflow-auto bg-white px-5 py-4 text-sm leading-7 text-slate-700 dark:bg-[#101a2d] dark:text-slate-200"
              dangerouslySetInnerHTML={{ __html: previewFragment.html }}
            />
          </div>
        ) : (
          <div className="h-full min-h-[320px] min-w-0 overflow-hidden border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] isolate dark:border-[#1a2a45] dark:bg-[#101a2d]">
            <FrameRender
              key={frameKey}
              ref={iframeRef}
              srcDoc={frameHtml || undefined}
              src="about:blank"
              className="h-full w-full"
              onLoad={handleFrameLoad}
              onError={handleFrameError}
            />
          </div>
        )}
        {status === "idle" ? <div className="pointer-events-none absolute inset-x-0 bottom-10 flex justify-center" /> : null}
      </div>
    </div>
  );
}
