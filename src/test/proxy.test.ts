import test from "node:test";
import assert from "node:assert/strict";
import {
  buildProxyBaseUrl,
  buildProxyPageUrl,
  buildProxyResourceUrl,
  detectUpstreamInterruption,
  extractReadableFragment,
  getTargetUrlFromProxyPageUrl,
  getTargetUrlFromProxyResourceUrl,
  normalizeTargetUrl,
  rewriteHtmlForProxy,
} from "../lib/proxy.js";

test("proxy helpers rewrite page and resource urls with stable routing", () => {
  assert.equal(
    buildProxyPageUrl("https://example.com/docs?id=1", "https://app.local"),
    "https://app.local/api/proxy/page?url=https%3A%2F%2Fexample.com%2Fdocs%3Fid%3D1",
  );
  assert.equal(
    buildProxyResourceUrl("https://example.com/assets/main.css?v=1", "https://app.local"),
    "https://app.local/api/proxy/resource?url=https%3A%2F%2Fexample.com%2Fassets%2Fmain.css%3Fv%3D1",
  );
  assert.equal(
    buildProxyBaseUrl("https://example.com/docs/guide/index.html", "https://app.local"),
    "https://app.local/api/proxy/resource?url=https%3A%2F%2Fexample.com%2Fdocs%2Fguide%2F",
  );
});

test("normalizeTargetUrl rejects local network targets", () => {
  assert.throws(() => normalizeTargetUrl("http://localhost:3000"), /本地或内网/);
  assert.throws(() => normalizeTargetUrl("http://127.0.0.1:8080"), /本地或内网/);
  assert.equal(normalizeTargetUrl("https://example.com/post"), "https://example.com/post");
});

test("getTargetUrlFromProxyPageUrl rebuilds target page urls from iframe location", () => {
  assert.equal(
    getTargetUrlFromProxyPageUrl(
      "https://app.local/api/proxy/page?url=https%3A%2F%2Fexample.com%2Fbooks%2Fch1",
      "https://app.local",
    ),
    "https://example.com/books/ch1",
  );
  assert.equal(getTargetUrlFromProxyPageUrl("https://app.local/other", "https://app.local"), null);
});

test("getTargetUrlFromProxyResourceUrl rebuilds target resource urls from proxy resource paths", () => {
  assert.equal(
    getTargetUrlFromProxyResourceUrl(
      "https://app.local/api/proxy/resource?url=https%3A%2F%2Fexample.com%2Fassets%2Fcover.png%3Fv%3D1",
      "https://app.local",
    ),
    "https://example.com/assets/cover.png?v=1",
  );
  assert.equal(getTargetUrlFromProxyResourceUrl("https://app.local/api/proxy/page?url=https://example.com", "https://app.local"), null);
});

test("rewriteHtmlForProxy rewrites asset and anchor urls while injecting iframe runtime script", () => {
  const rewritten = rewriteHtmlForProxy(
    `
      <html>
        <head>
          <meta http-equiv="Content-Security-Policy" content="default-src 'none'">
          <script src="/app.js"></script>
        </head>
        <body>
          <a href="/next/page">next</a>
          <img src="./cover.png" srcset="./cover.png 1x, ./cover@2x.png 2x">
        </body>
      </html>
    `,
    "https://example.com/books/ch1/index.html",
    "https://app.local",
  );

  assert.doesNotMatch(rewritten, /Content-Security-Policy/);
  assert.match(rewritten, /api\/proxy\/resource\?url=https%3A%2F%2Fexample\.com%2Fapp\.js/);
  assert.match(rewritten, /api\/proxy\/page\?url=https%3A%2F%2Fexample\.com%2Fnext%2Fpage/);
  assert.match(rewritten, /api\/proxy\/resource\?url=https%3A%2F%2Fexample\.com%2Fbooks%2Fch1%2Fcover\.png/);
  assert.match(rewritten, /data-html2md-original-href="\/next\/page"/);
  assert.match(rewritten, /window\.location\.assign/);
  assert.doesNotMatch(rewritten, /html2md-proxy-app/);
});

test("detectUpstreamInterruption identifies waf verification shells", () => {
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <script>var buid = "fffffffffffffffffff"</script>
        <script src="/C2WF946J0/probe.js?v=vc1jasc"></script>
      </head>
      <body></body>
    </html>
  `;
  const response = new Response(html, {
    status: 202,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "x-waf-uuid": "test-waf-id",
    },
  });

  assert.match(detectUpstreamInterruption(html, response) ?? "", /安全验证|风控拦截/);
});

test("detectUpstreamInterruption ignores normal article pages", () => {
  const html = `
    <html>
      <head><title>Example Article</title></head>
      <body>
        <main>
          <article>
            <h1>Normal Content</h1>
            <p>This is a normal article page.</p>
          </article>
        </main>
      </body>
    </html>
  `;
  const response = new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
    },
  });

  assert.equal(detectUpstreamInterruption(html, response), null);
});

test("extractReadableFragment keeps the main article content and absolutizes assets", () => {
  const html = `
    <html>
      <head>
        <title>Example Story</title>
      </head>
      <body>
        <header>site nav</header>
        <main>
          <article class="article-content">
            <p>第一段正文，包含足够多的标点和句子，用于帮助抽取器识别主要内容区域。</p>
            <p>第二段正文，继续补充更多文字，确保抽取结果稳定，并且不是一个很短的页面碎片。</p>
            <img data-src="/images/cover.jpg" alt="cover">
          </article>
        </main>
        <aside>related links</aside>
      </body>
    </html>
  `;

  const extracted = extractReadableFragment(html, "https://example.com/posts/story");

  assert.ok(extracted);
  assert.match(extracted.html, /<article/i);
  assert.match(extracted.html, /<h1>Example Story<\/h1>/);
  assert.match(extracted.html, /https:\/\/example\.com\/images\/cover\.jpg/);
  assert.doesNotMatch(extracted.html, /site nav/);
  assert.doesNotMatch(extracted.html, /related links/);
});
