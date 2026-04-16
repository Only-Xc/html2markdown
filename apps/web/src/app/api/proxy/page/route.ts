import { NextRequest } from "next/server";
import {
  detectUpstreamInterruption,
  fetchWithTimeout,
  getProxyErrorDetails,
  isHtmlContentType,
  normalizeTargetUrl,
  rewriteHtmlForProxy,
} from "@/lib/proxy";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const targetUrl = request.nextUrl.searchParams.get("url");

  if (!targetUrl) {
    return Response.json({ error: "缺少 url 参数。", code: "missing_url" }, { status: 400 });
  }

  try {
    const normalizedUrl = normalizeTargetUrl(targetUrl);
    const upstream = await fetchWithTimeout(normalizedUrl, undefined, {
      label: "代理页面上游请求",
    });

    if (!upstream.ok) {
      return Response.json(
        { error: `上游页面请求失败：${upstream.status}`, code: "upstream_request_failed" },
        { status: upstream.status },
      );
    }

    if (!isHtmlContentType(upstream.headers.get("content-type"))) {
      return Response.json({ error: "目标地址返回的不是 HTML 页面。", code: "unsupported_content_type" }, { status: 415 });
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
    const errorDetails = getProxyErrorDetails(error, "代理页面加载失败。", "proxy_request_failed");

    return Response.json(
      errorDetails,
      { status: errorDetails.status },
    );
  }
}
