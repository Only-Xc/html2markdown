import { NextRequest } from "next/server";
import { buildForwardHeaders, fetchWithTimeout, normalizeTargetUrl } from "@/lib/proxy";

export const runtime = "nodejs";

async function handleRequest(request: NextRequest) {
  const targetUrl = request.nextUrl.searchParams.get("url");

  if (!targetUrl) {
    return Response.json({ error: "缺少 url 参数。" }, { status: 400 });
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
    });
    const body = request.method === "HEAD" ? null : await upstream.arrayBuffer();

    return new Response(body, {
      status: upstream.status,
      headers: buildForwardHeaders(upstream),
    });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "资源代理失败。",
      },
      { status: 500 },
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
