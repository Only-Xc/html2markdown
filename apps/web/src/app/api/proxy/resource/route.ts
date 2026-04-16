import { NextRequest } from "next/server";
import { buildForwardHeaders, fetchWithTimeout, getProxyErrorDetails, normalizeTargetUrl } from "@/lib/proxy";

export const runtime = "nodejs";

async function handleRequest(request: NextRequest) {
  const targetUrl = request.nextUrl.searchParams.get("url");

  if (!targetUrl) {
    return Response.json({ error: "缺少 url 参数。", code: "missing_url" }, { status: 400 });
  }

  try {
    const normalizedUrl = normalizeTargetUrl(targetUrl);
    const requestBody =
      request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer();
    const upstreamHeaders = new Headers({
      accept: request.headers.get("accept") ?? "*/*",
    });
    const contentType = request.headers.get("content-type");

    if (contentType) {
      upstreamHeaders.set("content-type", contentType);
    }

    const upstream = await fetchWithTimeout(normalizedUrl, {
      method: request.method,
      body: requestBody,
      headers: upstreamHeaders,
    }, {
      label: "资源代理上游请求",
    });
    const body = request.method === "HEAD" ? null : await upstream.arrayBuffer();

    return new Response(body, {
      status: upstream.status,
      headers: buildForwardHeaders(upstream),
    });
  } catch (error) {
    const errorDetails = getProxyErrorDetails(error, "资源代理失败。", "resource_proxy_failed");

    return Response.json(
      errorDetails,
      { status: errorDetails.status },
    );
  }
}

export async function GET(request: NextRequest) {
  return handleRequest(request);
}

export async function POST(request: NextRequest) {
  return handleRequest(request);
}

export async function PUT(request: NextRequest) {
  return handleRequest(request);
}

export async function PATCH(request: NextRequest) {
  return handleRequest(request);
}

export async function DELETE(request: NextRequest) {
  return handleRequest(request);
}
