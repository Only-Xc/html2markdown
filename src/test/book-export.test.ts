import test from "node:test";
import assert from "node:assert/strict";

import { buildExportBundle } from "../lib/books/export.js";

test("buildExportBundle keeps chapter order and emits toc/readme", () => {
  const bundle = buildExportBundle(
    {
      id: "book-1",
      title: "示例书籍",
      createdAt: "2026-04-13T00:00:00.000Z",
      updatedAt: "2026-04-13T00:00:00.000Z",
    },
    [
      {
        id: "chapter-2",
        bookId: "book-1",
        title: "第二章",
        order: 1,
        html: "",
        markdown: "chapter two",
        createdAt: "",
        updatedAt: "",
      },
      {
        id: "chapter-1",
        bookId: "book-1",
        title: "第一章",
        order: 0,
        html: "",
        markdown: "chapter one",
        createdAt: "",
        updatedAt: "",
      },
    ],
    "2026-04-13T10:00:00.000Z",
  );

  assert.deepEqual(
    bundle.chapters.map((chapter) => chapter.fileName),
    ["01-第一章.md", "02-第二章.md"],
  );
  assert.deepEqual(
    bundle.toc.chapters.map((chapter) => chapter.title),
    ["第一章", "第二章"],
  );
  assert.match(bundle.readme, /1\. 第一章 \(01-第一章\.md\)/);
  assert.match(bundle.readme, /2\. 第二章 \(02-第二章\.md\)/);
  assert.equal(bundle.backup.book.title, "示例书籍");
  assert.equal(bundle.backup.chapters[0]?.html, "");
  assert.equal(bundle.backup.chapters[1]?.markdown, "chapter two");
});

test("buildExportBundle sanitizes duplicate, empty, and special-character chapter names", () => {
  const bundle = buildExportBundle(
    {
      id: "book-1",
      title: "示例书籍",
      createdAt: "",
      updatedAt: "",
    },
    [
      {
        id: "chapter-1",
        bookId: "book-1",
        title: "",
        order: 0,
        html: "",
        markdown: "",
        createdAt: "",
        updatedAt: "",
      },
      {
        id: "chapter-2",
        bookId: "book-1",
        title: "A/B",
        order: 1,
        html: "",
        markdown: "",
        createdAt: "",
        updatedAt: "",
      },
      {
        id: "chapter-3",
        bookId: "book-1",
        title: "A/B",
        order: 2,
        html: "",
        markdown: "",
        createdAt: "",
        updatedAt: "",
      },
    ],
    "2026-04-13T10:00:00.000Z",
  );

  assert.deepEqual(
    bundle.chapters.map((chapter) => chapter.fileName),
    ["01-第-1-章.md", "02-A-B.md", "03-A-B-2.md"],
  );
  assert.equal(bundle.toc.chapters[2]?.fileName, "03-A-B-2.md");
  assert.equal(bundle.backup.chapters[2]?.order, 2);
});
