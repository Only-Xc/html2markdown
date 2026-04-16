import test from "node:test";
import assert from "node:assert/strict";

import { applyChapterHtml, normalizeBookTitle, normalizeChapterTitle } from "../lib/books/model.js";

test("applyChapterHtml stores markdown converted from html", () => {
  const updated = applyChapterHtml(
    {
      id: "chapter-1",
      bookId: "book-1",
      title: "第一章",
      order: 0,
      html: "",
      markdown: "",
      createdAt: "2026-04-13T00:00:00.000Z",
      updatedAt: "2026-04-13T00:00:00.000Z",
    },
    "<h1>标题</h1><p>Hello <strong>world</strong></p>",
    "2026-04-13T01:00:00.000Z",
  );

  assert.equal(updated.html, "<h1>标题</h1><p>Hello <strong>world</strong></p>");
  assert.match(updated.markdown, /# 标题/);
  assert.match(updated.markdown, /Hello \*\*world\*\*/);
  assert.equal(updated.updatedAt, "2026-04-13T01:00:00.000Z");
});

test("normalize title helpers keep defaults stable", () => {
  assert.equal(normalizeBookTitle("   "), "未命名书籍");
  assert.equal(normalizeChapterTitle("   ", 3), "第 3 章");
  assert.equal(normalizeChapterTitle("正文", 3), "正文");
});
