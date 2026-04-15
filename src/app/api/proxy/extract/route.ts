import { NextRequest } from "next/server";
import {
  detectUpstreamInterruption,
  extractReadableFragment,
  fetchWithTimeout,
  isHtmlContentType,
  normalizeTargetUrl,
} from "@/lib/proxy";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const targetUrl = request.nextUrl.searchParams.get("url");

  if (!targetUrl) {
    return Response.json({ error: "缺少 url 参数。" }, { status: 400 });
  }

  try {
    const normalizedUrl = normalizeTargetUrl(targetUrl);
    const upstream = await fetchWithTimeout(normalizedUrl);

    if (!upstream.ok) {
      return Response.json({ error: `上游页面请求失败：${upstream.status}` }, { status: upstream.status });
    }

    if (!isHtmlContentType(upstream.headers.get("content-type"))) {
      return Response.json({ error: "目标地址返回的不是 HTML 页面。" }, { status: 415 });
    }

    const html = await upstream.text();
    const interruptionMessage = detectUpstreamInterruption(html, upstream);

    if (interruptionMessage) {
      return Response.json(
        {
          error: interruptionMessage,
          code: "upstream_verification_required",
        },
        { status: 409 },
      );
    }

    const extracted = extractReadableFragment(html, upstream.url || normalizedUrl);

    if (!extracted) {
      return Response.json(
        {
          error: "当前页面未能稳定识别出正文区域。你可以改用 iframe 选取，或手动粘贴 HTML。",
          code: "content_extraction_failed",
        },
        { status: 422 },
      );
    }

    return Response.json(
      {
        title: extracted.title,
        html: extracted.html,
        textLength: extracted.textLength,
        sourceUrl: upstream.url || normalizedUrl,
      },
      {
        status: 200,
        headers: {
          "cache-control": "no-store",
        },
      },
    );
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "正文提取失败。",
      },
      { status: 500 },
    );
  }
}
