# html2md

用于整理书籍章节的 HTML 转 Markdown Next.js 应用，支持整书导出与 `book.json` 再导入。

## 开发

```bash
npm install
npm run dev     # 访问 http://localhost:3000
npm run build   # 输出到 .next-build，不污染 dev 使用的 .next
npm start       # 读取 .next-build
```

### 开发产物隔离

- `next dev` 固定使用 `.next`
- `npm run build` / `npm start` 固定使用 `.next-build`
- 不要再让开发态和构建态共享同一个产物目录，否则会导致热更新、路由清单和模块解析异常
- 代理采集功能调试时，优先执行 `npm test`；只有在明确需要验证生产构建时才运行 `npm run build`
- 执行可能影响开发环境的命令前，先提醒用户本次会不会触碰 `.next` 或 dev 进程

## 测试

```bash
npm test        # 运行 src/lib/converter.ts 的单元测试
```

## 项目结构

- `src/app/page.tsx` — 首页书架入口
- `src/app/books/[bookId]/page.tsx` — 单本书工作台动态路由入口
- `src/app/layout.tsx` — 根布局
- `src/app/globals.css` — Tailwind v4 + shadcn/ui 主题 + typography 样式
- `src/lib/converter.ts` — 核心转换逻辑（turndown + GFM + 自定义规则）
- `src/lib/books/export.ts` — 整书导出/`book.json` 导入解析
- `src/lib/books/repository.ts` — IndexedDB 仓储 + 书籍导入落库
- `src/lib/utils.ts` — `cn()` 工具函数（clsx + tailwind-merge）
- `src/components/HtmlEditor.tsx` — 左侧 HTML 输入面板
- `src/components/MarkdownPreview.tsx` — 右侧 Markdown 渲染预览面板
- `src/components/ui/` — shadcn/ui 基础组件（Button, Badge）
- `src/test/converter.test.ts` — 转换规则单元测试

## 技术栈

- Next.js 15（App Router）+ TypeScript
- Tailwind CSS v4 + @tailwindcss/typography + tw-animate-css
- shadcn/ui（new-york 风格）
- Ant Design（Modal / Drawer / Tooltip / Message）
- `turndown` + `turndown-plugin-gfm`：HTML → Markdown
- `react-markdown` + `remark-gfm` + `rehype-raw`：Markdown 渲染

## 关键约定

- HTML 转 Markdown 的核心转换逻辑完全在客户端执行（即时响应）
- 链接采集依赖 Next.js API Route 与 Node 运行时，部署目标默认是 Vercel 一类支持服务端能力的平台
- `src/lib/converter.ts` 只处理字符串，不触碰文件系统
- 整书导出 zip 除章节 `.md`、`README.md`、`toc.json` 外，还包含可恢复编辑态的 `book.json`
- 书架页支持直接导入单个 `book.json`，恢复为新的本地书籍记录
- 书籍工作台通过 `/books/[bookId]` 动态路由访问
- 使用 `@/*` 路径别名，指向 `src/*`

## 详细规格

- `docs/design.md` — 设计文档（架构、模块设计、错误处理、设计决策）
- `docs/spec.md` — 行为规格（BDD 场景）
- `docs/ui-layout-rules.md` — 通用布局与防溢出规则
