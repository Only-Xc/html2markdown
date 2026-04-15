import { NextRequest } from "next/server";
import { detectUpstreamInterruption, fetchWithTimeout, isHtmlContentType, normalizeTargetUrl, rewriteHtmlForProxy } from "@/lib/proxy";

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

    const appOrigin = request.nextUrl.origin;
    const rewrittenHtml = rewriteHtmlForProxy(html, upstream.url || normalizedUrl, appOrigin);

    return new Response(rewrittenHtml, {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "代理页面加载失败。",
      },
      { status: 500 },
    );
  }
}
