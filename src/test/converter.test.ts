import test from "node:test";
import assert from "node:assert/strict";

import { convert } from "../lib/converter.js";

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
