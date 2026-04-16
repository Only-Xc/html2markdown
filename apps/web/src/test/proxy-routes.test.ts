import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

import { GET as extractProxyGet } from "../app/api/proxy/extract/route.js";
import { GET as pageProxyGet } from "../app/api/proxy/page/route.js";
import { GET as resourceProxyGet } from "../app/api/proxy/resource/route.js";

test("proxy page route returns invalid_target_url for forbidden hosts", async () => {
  const request = new NextRequest("https://app.local/api/proxy/page?url=http://127.0.0.1:3000");
  const response = await pageProxyGet(request);
  const payload = (await response.json()) as { code?: string; error?: string };

  assert.equal(response.status, 400);
  assert.equal(payload.code, "invalid_target_url");
  assert.match(payload.error ?? "", /本地或内网/);
});

test("proxy extract route returns verification code when upstream is blocked", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () =>
    new Response(
      `
        <html>
          <head><script src="/abc/probe.js"></script></head>
          <body></body>
        </html>
      `,
      {
        status: 202,
        headers: {
          "content-type": "text/html; charset=utf-8",
          "x-waf-uuid": "blocked",
        },
      },
    );

  try {
    const request = new NextRequest("https://app.local/api/proxy/extract?url=https://example.com/post");
    const response = await extractProxyGet(request);
    const payload = (await response.json()) as { code?: string; error?: string };

    assert.equal(response.status, 409);
    assert.equal(payload.code, "upstream_verification_required");
    assert.match(payload.error ?? "", /风控拦截|安全验证/);
  } finally {
    global.fetch = originalFetch;
  }
});

test("proxy resource route returns upstream_timeout when upstream aborts", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => {
    throw new DOMException("Aborted", "AbortError");
  };

  try {
    const request = new NextRequest("https://app.local/api/proxy/resource?url=https://example.com/asset.js");
    const response = await resourceProxyGet(request);
    const payload = (await response.json()) as { code?: string; error?: string };

    assert.equal(response.status, 504);
    assert.equal(payload.code, "upstream_timeout");
    assert.match(payload.error ?? "", /资源代理上游请求超时/);
  } finally {
    global.fetch = originalFetch;
  }
});
