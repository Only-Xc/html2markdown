import { load } from "cheerio";

const FORBIDDEN_HOST_PATTERNS = [
  /^localhost$/i,
  /^0\.0\.0\.0$/,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^\[::1\]$/i,
  /\.local$/i,
];

const REWRITABLE_ATTRIBUTES: Array<{ selector: string; attribute: string; mode: "page" | "resource" }> = [
  { selector: "img[src]", attribute: "src", mode: "resource" },
  { selector: "script[src]", attribute: "src", mode: "resource" },
  { selector: "iframe[src]", attribute: "src", mode: "resource" },
  { selector: "embed[src]", attribute: "src", mode: "resource" },
  { selector: "source[src]", attribute: "src", mode: "resource" },
  { selector: "track[src]", attribute: "src", mode: "resource" },
  { selector: "audio[src]", attribute: "src", mode: "resource" },
  { selector: "video[src]", attribute: "src", mode: "resource" },
  { selector: "video[poster]", attribute: "poster", mode: "resource" },
  { selector: "object[data]", attribute: "data", mode: "resource" },
  { selector: "link[href]", attribute: "href", mode: "resource" },
  { selector: "a[href]", attribute: "href", mode: "page" },
  { selector: "form[action]", attribute: "action", mode: "resource" },
];

const KNOWN_INTERSTITIAL_PATTERNS = [
  /\/[a-z0-9]+\/probe\.js\b/i,
  /\bx-waf\b/i,
  /\bcaptcha\b/i,
  /\bverification\b/i,
  /\bverify\b/i,
];

const READABILITY_CANDIDATE_SELECTORS = [
  "article",
  "main article",
  "main",
  "[role='main']",
  ".article",
  ".article-content",
  ".article-body",
  ".post-content",
  ".entry-content",
  ".content",
  ".content-detail",
  ".rich-content",
  ".markdown-body",
];

const URL_ATTRIBUTES: Array<{
  selector: string;
  attribute: "src" | "href" | "poster" | "data";
  originalAttribute?: string;
}> = [
  { selector: "img[src]", attribute: "src" },
  { selector: "img[data-src]", attribute: "src", originalAttribute: "data-src" },
  { selector: "img[data-original]", attribute: "src", originalAttribute: "data-original" },
  { selector: "img[data-lazy-src]", attribute: "src", originalAttribute: "data-lazy-src" },
  { selector: "source[src]", attribute: "src" },
  { selector: "video[src]", attribute: "src" },
  { selector: "video[poster]", attribute: "poster" },
  { selector: "audio[src]", attribute: "src" },
  { selector: "iframe[src]", attribute: "src" },
  { selector: "a[href]", attribute: "href" },
];

const REMOVABLE_CONTENT_SELECTORS = [
  "script",
  "style",
  "noscript",
  "template",
  "svg",
  "canvas",
  "form",
  "button",
  "input",
  "select",
  "textarea",
  "header",
  "footer",
  "nav",
  "aside",
];

const NOISY_CLASS_PATTERN =
  /(comment|related|recommend|advert|ad-|ads|share|toolbar|breadcrumb|pagination|sidebar|aside|footer|header|mask|modal|popup|fixed|floating|subscribe|copyright|cookie|banner|social|author|profile|avatar|meta|tag-list)/i;

export type ProxyErrorCode =
  | "invalid_target_url"
  | "missing_url"
  | "upstream_request_failed"
  | "unsupported_content_type"
  | "upstream_verification_required"
  | "content_extraction_failed"
  | "upstream_timeout"
  | "proxy_request_failed"
  | "resource_proxy_failed";

export class ProxyRequestError extends Error {
  code: ProxyErrorCode;
  status: number;

  constructor(message: string, code: ProxyErrorCode, status: number) {
    super(message);
    this.name = "ProxyRequestError";
    this.code = code;
    this.status = status;
  }
}

export function getProxyErrorDetails(
  error: unknown,
  fallbackMessage: string,
  fallbackCode: ProxyErrorCode,
  fallbackStatus = 500,
): { error: string; code: ProxyErrorCode; status: number } {
  if (error instanceof ProxyRequestError) {
    return {
      error: error.message,
      code: error.code,
      status: error.status,
    };
  }

  return {
    error: error instanceof Error ? error.message : fallbackMessage,
    code: fallbackCode,
    status: fallbackStatus,
  };
}

function hasSupportedScheme(value: string): boolean {
  return /^(https?:)?\/\//i.test(value) || value.startsWith("/") || value.startsWith("./") || value.startsWith("../");
}

function shouldSkipRewrite(value: string): boolean {
  return (
    value === "" ||
    value.startsWith("#") ||
    value.startsWith("data:") ||
    value.startsWith("javascript:") ||
    value.startsWith("mailto:") ||
    value.startsWith("tel:")
  );
}

function isPrivateHost(hostname: string): boolean {
  return FORBIDDEN_HOST_PATTERNS.some((pattern) => pattern.test(hostname));
}

function rewriteSrcSet(value: string, baseUrl: string, appOrigin: string): string {
  return value
    .split(",")
    .map((entry) => {
      const trimmed = entry.trim();

      if (trimmed === "") {
        return trimmed;
      }

      const [urlPart, descriptor] = trimmed.split(/\s+/, 2);
      const rewrittenUrl = buildProxyResourceUrl(resolveTargetUrl(urlPart, baseUrl), appOrigin);
      return descriptor ? `${rewrittenUrl} ${descriptor}` : rewrittenUrl;
    })
    .join(", ");
}

export function normalizeTargetUrl(input: string): string {
  const trimmed = input.trim();

  if (trimmed === "") {
    throw new ProxyRequestError("请输入网页链接。", "invalid_target_url", 400);
  }

  let url: URL;

  try {
    url = new URL(trimmed);
  } catch {
    throw new ProxyRequestError("请输入有效的网页链接。", "invalid_target_url", 400);
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new ProxyRequestError("仅支持 http 或 https 链接。", "invalid_target_url", 400);
  }

  if (isPrivateHost(url.hostname)) {
    throw new ProxyRequestError("当前代理不允许访问本地或内网地址。", "invalid_target_url", 400);
  }

  return url.toString();
}

export function isHtmlContentType(contentType: string | null): boolean {
  if (!contentType) {
    return true;
  }

  const normalized = contentType.toLowerCase();
  return normalized.includes("text/html") || normalized.includes("application/xhtml+xml");
}

export function resolveTargetUrl(input: string, baseUrl: string): string {
  return new URL(input, baseUrl).toString();
}

export function buildProxyPageUrl(targetUrl: string, appOrigin: string): string {
  const proxyUrl = new URL("/api/proxy/page", appOrigin);
  proxyUrl.searchParams.set("url", normalizeTargetUrl(targetUrl));
  return proxyUrl.toString();
}

export function getTargetUrlFromProxyPageUrl(proxyPageUrl: string, appOrigin: string): string | null {
  const normalizedUrl = new URL(proxyPageUrl, appOrigin);

  if (normalizedUrl.origin !== new URL(appOrigin).origin || normalizedUrl.pathname !== "/api/proxy/page") {
    return null;
  }

  const targetUrl = normalizedUrl.searchParams.get("url");
  return targetUrl ? normalizeTargetUrl(targetUrl) : null;
}

export function getTargetUrlFromProxyResourceUrl(proxyResourceUrl: string, appOrigin: string): string | null {
  const normalizedUrl = new URL(proxyResourceUrl, appOrigin);
  if (normalizedUrl.origin !== new URL(appOrigin).origin || normalizedUrl.pathname !== "/api/proxy/resource") {
    return null;
  }

  const targetUrl = normalizedUrl.searchParams.get("url");
  return targetUrl ? normalizeTargetUrl(targetUrl) : null;
}

export function buildProxyResourceUrl(targetUrl: string, appOrigin: string): string {
  const proxyUrl = new URL("/api/proxy/resource", appOrigin);
  proxyUrl.searchParams.set("url", normalizeTargetUrl(targetUrl));
  return proxyUrl.toString();
}

export function buildProxyBaseUrl(targetUrl: string, appOrigin: string): string {
  const normalizedUrl = new URL(normalizeTargetUrl(targetUrl));
  const directoryUrl = new URL(normalizedUrl.toString());
  directoryUrl.pathname = directoryUrl.pathname.endsWith("/")
    ? directoryUrl.pathname
    : directoryUrl.pathname.replace(/[^/]+$/, "");
  return buildProxyResourceUrl(directoryUrl.toString(), appOrigin);
}

export function buildProxyRuntimeScript(pageUrl: string, appOrigin: string): string {
  return `
(function () {
  const APP_ORIGIN = ${JSON.stringify(appOrigin)};
  let currentUrl = ${JSON.stringify(pageUrl)};
  const originalFetch = window.fetch ? window.fetch.bind(window) : null;
  const originalXhrOpen = XMLHttpRequest.prototype.open;
  const originalPushState = history.pushState.bind(history);
  const originalReplaceState = history.replaceState.bind(history);

  function toAbsolute(input, base) {
    return new URL(String(input), base || currentUrl).toString();
  }

  function encodeResourceUrl(targetUrl) {
    const proxied = new URL("/api/proxy/resource", APP_ORIGIN);
    proxied.searchParams.set("url", targetUrl);
    return proxied.toString();
  }

  function encodePageUrl(targetUrl) {
    const proxied = new URL("/api/proxy/page", APP_ORIGIN);
    proxied.searchParams.set("url", targetUrl);
    return proxied.toString();
  }

  function navigateToTarget(targetUrl, replace) {
    const nextUrl = toAbsolute(targetUrl, currentUrl);
    currentUrl = nextUrl;
    const proxiedUrl = encodePageUrl(nextUrl);

    if (replace) {
      window.location.replace(proxiedUrl);
      return;
    }

    window.location.assign(proxiedUrl);
  }

  function rewriteToResource(input, base) {
    const absolute = toAbsolute(input, base);
    if (!/^https?:/i.test(absolute)) {
      return absolute;
    }

    return encodeResourceUrl(absolute);
  }

  function handleAnchorClick(event) {
    const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;

    if (!anchor) {
      return;
    }

    const href = anchor.getAttribute("href");
    const originalHref = anchor.getAttribute("data-html2md-original-href");

    if (
      !href ||
      href.startsWith("#") ||
      href.startsWith("mailto:") ||
      href.startsWith("tel:") ||
      anchor.target === "_blank" ||
      anchor.hasAttribute("download")
    ) {
      return;
    }

    const absoluteHref = new URL(href, window.location.href);

    if (absoluteHref.origin === window.location.origin && absoluteHref.pathname === "/api/proxy/page") {
      return;
    }

    event.preventDefault();
    navigateToTarget(originalHref || href, false);
  }

  function handleHistoryChange(url) {
    if (!url) {
      return;
    }

    navigateToTarget(url, false);
  }

  function handleSubmit(event) {
    const form = event.target instanceof HTMLFormElement ? event.target : null;

    if (!form) {
      return;
    }

    const method = (form.method || "get").toLowerCase();
    const action = form.getAttribute("data-html2md-original-action") || form.getAttribute("action") || currentUrl;

    if (method !== "get") {
      return;
    }

    event.preventDefault();
    const nextUrl = new URL(action, currentUrl);
    const formData = new FormData(form);
    formData.forEach(function (value, key) {
      nextUrl.searchParams.set(key, String(value));
    });
    navigateToTarget(nextUrl.toString(), false);
  }

  if (originalFetch) {
    window.fetch = function (input, init) {
      try {
        if (typeof input === "string" || input instanceof URL) {
          return originalFetch(rewriteToResource(input, currentUrl), init);
        }

        if (input instanceof Request) {
          return originalFetch(new Request(rewriteToResource(input.url, currentUrl), input), init);
        }
      } catch {}

      return originalFetch(input, init);
    };
  }

  XMLHttpRequest.prototype.open = function (method, url) {
    const args = Array.prototype.slice.call(arguments);
    try {
      if (typeof url === "string") {
        args[1] = rewriteToResource(url, currentUrl);
      }
    } catch {}

    return originalXhrOpen.apply(this, args);
  };

  history.pushState = function (state, title, url) {
    if (url) {
      handleHistoryChange(url);
      return undefined;
    }

    return originalPushState(state, title, url);
  };

  history.replaceState = function (state, title, url) {
    if (url) {
      navigateToTarget(url, true);
      return undefined;
    }

    return originalReplaceState(state, title, url);
  };

  document.addEventListener("click", handleAnchorClick, true);
  document.addEventListener("submit", handleSubmit, true);
})();
`.trim();
}

export function detectUpstreamInterruption(
  html: string,
  response: Pick<Response, "status" | "headers">,
): string | null {
  const hasWafHeader = response.headers.has("x-waf-uuid");
  const setCookie = response.headers.get("set-cookie") ?? "";
  const hasWafCookie = /x-waf-/i.test(setCookie);
  const compactHtml = html.replace(/\s+/g, " ").trim();
  const lowerHtml = compactHtml.toLowerCase();

  let bodyText = "";

  try {
    bodyText = load(html)("body").text().replace(/\s+/g, " ").trim();
  } catch {
    bodyText = "";
  }

  const hasKnownInterstitialScript = KNOWN_INTERSTITIAL_PATTERNS.some((pattern) => pattern.test(compactHtml));
  const bodyLooksEmpty = bodyText === "";
  const htmlLooksTiny = compactHtml.length > 0 && compactHtml.length <= 1200;
  const looksLikeVerificationShell =
    hasKnownInterstitialScript || lowerHtml.includes("<body></body>") || lowerHtml.includes("<body> </body>");

  if (
    hasWafHeader ||
    hasWafCookie ||
    (response.status === 202 && looksLikeVerificationShell) ||
    (htmlLooksTiny && bodyLooksEmpty && looksLikeVerificationShell)
  ) {
    return "目标站点触发了安全验证或风控拦截，当前代理无法自动采集该页面。请改用可直接访问的公开页面，或手动粘贴需要的 HTML 内容。";
  }

  return null;
}

function normalizeTextContent(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function resolveTargetUrlSafely(input: string, baseUrl: string): string | null {
  try {
    return resolveTargetUrl(input, baseUrl);
  } catch {
    return null;
  }
}

function getElementSignalValue(rawValue: string | undefined): string {
  return rawValue ? rawValue.toLowerCase() : "";
}

function removeNoisySubtrees(root: ReturnType<typeof load>, containerSelector: string) {
  root(containerSelector)
    .find(REMOVABLE_CONTENT_SELECTORS.join(", "))
    .remove();

  root(containerSelector)
    .find("*")
    .each((_, element) => {
      const current = root(element);
      const id = getElementSignalValue(current.attr("id"));
      const className = getElementSignalValue(current.attr("class"));
      const ariaHidden = current.attr("aria-hidden");
      const hidden = current.attr("hidden");

      if (
        NOISY_CLASS_PATTERN.test(id) ||
        NOISY_CLASS_PATTERN.test(className) ||
        ariaHidden === "true" ||
        hidden !== undefined
      ) {
        current.remove();
      }
    });
}

function rewriteExtractedFragmentUrls(root: ReturnType<typeof load>, containerSelector: string, pageUrl: string) {
  for (const rule of URL_ATTRIBUTES) {
    root(containerSelector)
      .find(rule.selector)
      .each((_, element) => {
        const current = root(element);
        const sourceValue = rule.originalAttribute
          ? current.attr(rule.originalAttribute) ?? current.attr(rule.attribute)
          : current.attr(rule.attribute);

        if (!sourceValue || shouldSkipRewrite(sourceValue) || !hasSupportedScheme(sourceValue)) {
          return;
        }

        const resolved = resolveTargetUrlSafely(sourceValue, pageUrl);

        if (!resolved) {
          return;
        }

        current.attr(rule.attribute, resolved);
      });
  }

  root(containerSelector)
    .find("[srcset]")
    .each((_, element) => {
      const current = root(element);
      const srcset = current.attr("srcset");

      if (!srcset) {
        return;
      }

      const rewritten = srcset
        .split(",")
        .map((entry) => {
          const trimmed = entry.trim();

          if (trimmed === "") {
            return trimmed;
          }

          const [urlPart, descriptor] = trimmed.split(/\s+/, 2);
          const resolvedUrl = resolveTargetUrlSafely(urlPart, pageUrl);
          if (!resolvedUrl) {
            return trimmed;
          }
          return descriptor ? `${resolvedUrl} ${descriptor}` : resolvedUrl;
        })
        .join(", ");

      current.attr("srcset", rewritten);
    });
}

type CheerioRoot = ReturnType<typeof load>;

function scoreReadableCandidate(root: CheerioRoot, element: Parameters<CheerioRoot>[0]): number {
  const current = root(element);
  const text = normalizeTextContent(current.text());
  const textLength = text.length;

  if (textLength < 60) {
    return -1;
  }

  const paragraphCount = current.find("p").length;
  const headingCount = current.find("h1, h2, h3").length;
  const imageCount = current.find("img, figure").length;
  const listCount = current.find("ul, ol").length;
  const articleSignals = current.find("article, [role='main'], .article-content, .entry-content, .markdown-body").length;
  const linkTextLength = normalizeTextContent(
    current
      .find("a")
      .toArray()
      .map((node) => root(node).text())
      .join(" "),
  ).length;
  const punctuationCount = (text.match(/[。！？；：,.!?;:]/g) ?? []).length;
  const id = getElementSignalValue(current.attr("id"));
  const className = getElementSignalValue(current.attr("class"));
  const headingTextLength = normalizeTextContent(
    current
      .find("h1, h2, h3")
      .toArray()
      .map((node) => root(node).text())
      .join(" "),
  ).length;
  const linkDensityPenalty = textLength > 0 ? (linkTextLength / textLength) * 260 : 0;
  const noisyPenalty = NOISY_CLASS_PATTERN.test(`${id} ${className}`) ? 800 : 0;
  const shortContentPenalty = textLength < 140 && paragraphCount < 2 ? 180 : 0;

  return (
    textLength +
    paragraphCount * 120 +
    headingCount * 60 +
    articleSignals * 90 +
    imageCount * 35 +
    listCount * 30 +
    headingTextLength * 0.2 +
    punctuationCount * 8 -
    linkTextLength * 0.35 -
    linkDensityPenalty -
    noisyPenalty -
    shortContentPenalty
  );
}

export function extractReadableFragment(
  rawHtml: string,
  pageUrl: string,
): { html: string; title: string; textLength: number } | null {
  const $ = load(rawHtml);
  const body = $("body");

  if (body.length === 0) {
    return null;
  }

  let bestElementHtml: string | null = null;
  let bestScore = -1;

  for (const selector of READABILITY_CANDIDATE_SELECTORS) {
    $(selector).each((_, element) => {
      const score = scoreReadableCandidate($, element);

      if (score > bestScore) {
        bestScore = score;
        bestElementHtml = $.html(element) ?? null;
      }
    });
  }

  if (!bestElementHtml) {
    body.find("article, main, section, div").each((_, element) => {
      const score = scoreReadableCandidate($, element);

      if (score > bestScore) {
        bestScore = score;
        bestElementHtml = $.html(element) ?? null;
      }
    });
  }

  if (!bestElementHtml) {
    return null;
  }

  const fragmentRoot = load(`<div id="html2md-fragment-root">${bestElementHtml}</div>`);
  const fragment = fragmentRoot("#html2md-fragment-root").children().first().clone();

  if (fragment.length === 0) {
    return null;
  }

  const wrapper = load("<div id=\"html2md-readable-root\"></div>");
  wrapper("#html2md-readable-root").append(fragment);
  removeNoisySubtrees(wrapper, "#html2md-readable-root");
  rewriteExtractedFragmentUrls(wrapper, "#html2md-readable-root", pageUrl);

  const rootElement = wrapper("#html2md-readable-root").children().first();
  const extractedText = normalizeTextContent(rootElement.text());

  if (extractedText.length < 60) {
    return null;
  }

  const title =
    normalizeTextContent($("meta[property='og:title']").attr("content") ?? "") ||
    normalizeTextContent($("title").first().text()) ||
    normalizeTextContent(rootElement.find("h1").first().text()) ||
    "未命名文章";

  if (rootElement.find("h1").length === 0 && title !== "") {
    rootElement.prepend(`<h1>${title}</h1>`);
  }
  return {
    html: wrapper("#html2md-readable-root").html() ?? "",
    title,
    textLength: extractedText.length,
  };
}

export function rewriteHtmlForProxy(rawHtml: string, pageUrl: string, appOrigin: string): string {
  const $ = load(rawHtml);

  $("meta[http-equiv='Content-Security-Policy'], meta[http-equiv='refresh'], base").remove();

  $("head").prepend(`<base href="${buildProxyBaseUrl(pageUrl, appOrigin)}">`);

  for (const rule of REWRITABLE_ATTRIBUTES) {
    $(rule.selector).each((_, element) => {
      const value = $(element).attr(rule.attribute);

      if (!value || shouldSkipRewrite(value) || !hasSupportedScheme(value)) {
        return;
      }

      const resolved = resolveTargetUrl(value, pageUrl);
      const rewritten =
        rule.mode === "page" ? buildProxyPageUrl(resolved, appOrigin) : buildProxyResourceUrl(resolved, appOrigin);

      if (rule.selector === "a[href]") {
        $(element).attr("data-html2md-original-href", value);
      }

      if (rule.selector === "form[action]") {
        $(element).attr("data-html2md-original-action", value);
      }

      $(element).attr(rule.attribute, rewritten);
      $(element).removeAttr("integrity");
      $(element).removeAttr("nonce");
    });
  }

  $("[srcset]").each((_, element) => {
    const value = $(element).attr("srcset");

    if (!value) {
      return;
    }

    $(element).attr("srcset", rewriteSrcSet(value, pageUrl, appOrigin));
  });

  const runtimeScript = buildProxyRuntimeScript(pageUrl, appOrigin);
  $("body").append(`<script>${runtimeScript}</script>`);

  return $.html();
}

export async function fetchWithTimeout(
  url: string,
  init?: RequestInit,
  options?: { label?: string; timeoutMs?: number },
): Promise<Response> {
  const controller = new AbortController();
  const timeoutMs = options?.timeoutMs ?? 15000;
  const label = options?.label ?? "上游请求";
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
        accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        ...init?.headers,
      },
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ProxyRequestError(`${label}超时。`, "upstream_timeout", 504);
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export function buildForwardHeaders(response: Response): Headers {
  const headers = new Headers();
  const contentType = response.headers.get("content-type");
  const cacheControl = response.headers.get("cache-control");
  const etag = response.headers.get("etag");
  const lastModified = response.headers.get("last-modified");

  if (contentType) {
    headers.set("content-type", contentType);
  }

  if (cacheControl) {
    headers.set("cache-control", cacheControl);
  }

  if (etag) {
    headers.set("etag", etag);
  }

  if (lastModified) {
    headers.set("last-modified", lastModified);
  }

  return headers;
}
