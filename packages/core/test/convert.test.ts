import test from "node:test";
import assert from "node:assert/strict";

import { convert } from "../src/index.js";

test("convert supports GFM tables and task lists", () => {
  const markdown = convert(`
    <table>
      <thead><tr><th>Name</th><th>Done</th></tr></thead>
      <tbody><tr><td>Task</td><td><input checked type="checkbox" /></td></tr></tbody>
    </table>
  `);

  assert.match(markdown, /\| Name\s+\| Done\s+\|/);
  assert.match(markdown, /Task/);
});

test("convert expands details and summary content", () => {
  const markdown = convert(`
    <details>
      <summary>Read more</summary>
      <p>Hello <strong>world</strong>.</p>
    </details>
  `);

  assert.match(markdown, /\*\*Read more\*\*/);
  assert.match(markdown, /Hello \*\*world\*\*\./);
});

test("convert keeps text content for unsupported wrapper tags", () => {
  const markdown = convert("<div><span>Wrapped text</span></div>");

  assert.equal(markdown, "Wrapped text");
});

test("convert removes embedded style content from article wrappers", () => {
  const markdown = convert(`
    <div class="markdown-body">
      <style>.markdown-body { color: red; }</style>
      <p>Hello</p>
    </div>
  `);

  assert.equal(markdown, "Hello");
});

test("convert removes code block header chrome and keeps fenced code", () => {
  const markdown = convert(`
    <pre>
      <div class="code-block-extension-header">
        <span class="code-block-extension-lang">shell</span>
        <div class="code-block-extension-copyCodeBtn">复制代码</div>
      </div>
      <code class="language-shell">echo hello\n</code>
    </pre>
  `);

  assert.doesNotMatch(markdown, /复制代码|shell\s*\n\s*复制代码/);
  assert.match(markdown, /```shell\s+echo hello\s+```/);
});

test("convert renders bare pre elements as fenced code blocks", () => {
  const markdown = convert(`
    <pre>line one
line two</pre>
  `);

  assert.equal(markdown, "```\nline one\nline two\n```");
});

test("convert returns an empty string for whitespace-only input", () => {
  assert.equal(convert("   \n\t  "), "");
});

test("convert keeps plain text stable without parsing overhead", () => {
  assert.equal(convert("hello world"), "hello world");
});

test("convert returns an empty string for comment-only input", () => {
  assert.equal(convert("<!-- hidden --><!-- still hidden -->"), "");
});

test("convert tolerates non-string input from JavaScript callers", () => {
  assert.equal(convert(undefined as unknown as string), "");
  assert.equal(convert(42 as unknown as string), "42");
});

test("convert removes mixed-case noisy tags", () => {
  const markdown = convert(`
    <DIV>
      <SVG><rect /></SVG>
      <TEMPLATE><p>skip me</p></TEMPLATE>
      <P>Hello</P>
    </DIV>
  `);

  assert.equal(markdown, "Hello");
});

test("convert reads language from lang-* class and data-language", () => {
  const langClassMarkdown = convert(`
    <pre class="lang-ts"><code>const a = 1;\n</code></pre>
  `);
  const dataLanguageMarkdown = convert(`
    <pre data-language="bash">echo hi\n</pre>
  `);

  assert.match(langClassMarkdown, /```ts\s+const a = 1;\s+```/);
  assert.match(dataLanguageMarkdown, /```bash\s+echo hi\s+```/);
});

test("convert strips noisy pre block helpers before extracting code", () => {
  const markdown = convert(`
    <pre data-language="js">
      <div class="highlight-tools">tools</div>
      <div class="code-block-extension-copyCodeBtn">copy</div>
      console.log("ok");
    </pre>
  `);

  assert.equal(markdown, "```js\n      console.log(\"ok\");\n```");
});

test("convert keeps nested details content in order", () => {
  const markdown = convert(`
    <details>
      <summary>Outer</summary>
      <p>Before</p>
      <details>
        <summary>Inner</summary>
        <p>Inside</p>
      </details>
      <p>After</p>
    </details>
  `);

  assert.match(markdown, /\*\*Outer\*\*/);
  assert.match(markdown, /Before/);
  assert.match(markdown, /\*\*Inner\*\*/);
  assert.match(markdown, /Inside/);
  assert.match(markdown, /After/);
});

test("convert produces deterministic output across repeated calls", () => {
  const input = `
    <details>
      <summary>Stable</summary>
      <pre><code class="language-js">console.log("x");\n</code></pre>
    </details>
  `;
  const first = convert(input);

  for (let index = 0; index < 100; index += 1) {
    assert.equal(convert(input), first);
  }
});
