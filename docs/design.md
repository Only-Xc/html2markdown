# html2md 设计文档

**更新日期：** 2026-04-14

## 背景与目标

当前项目已经从“单文件 HTML 转 Markdown 页面”演进为一个面向单用户、本机浏览器使用的书籍管理器。它的核心目标不再是一次性转换单个 HTML，而是帮助用户把多章 HTML 内容沉淀为一本结构化书籍，并在保存时持续生成 Markdown，最终打包导出。

**目标：**
- 提供一个本地书架，用于创建、进入、删除书籍
- 提供单本书工作台，用于管理章节、编辑 HTML、预览 Markdown
- 在章节保存时自动调用转换器生成派生 Markdown
- 支持整本书导出为 zip，内含章节 Markdown、`README.md`、`toc.json` 与完整备份 `book.json`
- 支持通过单个 `book.json` 将整本书重新导入书架并继续编辑
- 在视觉上保持“阅读产品”而非“开发工具”的体验，采用蓝白主色、扁平化、内容优先的设计

**非目标：**
- 不支持登录、多用户、云同步或协作编辑
- 不支持 Markdown 反向编辑 HTML
- 不支持卷/章多级嵌套，章节结构保持单层有序列表
- 不引入服务端数据库或文件持久化

## 技术栈

- **框架：** Next.js App Router
- **语言：** TypeScript
- **运行时：** React 19 + Next.js 15
- **样式：**
  - Tailwind CSS 4
  - 自定义 CSS 变量主题
  - Ant Design 用于模态框与消息提示
- **核心库：**
  - `turndown`
  - `turndown-plugin-gfm`
  - `jszip`

## 信息架构

### `/`

首页为书架页，负责：
- 展示全部书籍
- 新建书籍
- 导入 `book.json`
- 删除书籍
- 进入单本书工作台

### `/books/[bookId]`

书籍工作台负责：
- 展示书名与基础操作
- 管理章节列表
- 编辑当前章节 HTML
- 预览当前章节 Markdown
- 导出整本书

### `/api/convert`

保留现有转换 API，用于兼容纯转换调用场景。书籍工作台主流程默认直接复用前端 `convert()`，不依赖该接口。

## 数据模型

### `BookRecord`

- `id`
- `title`
- `createdAt`
- `updatedAt`

### `BookSummary`

在 `BookRecord` 基础上增加：
- `chapterCount`

### `ChapterRecord`

- `id`
- `bookId`
- `title`
- `order`
- `html`
- `markdown`
- `createdAt`
- `updatedAt`

### `ExportToc`

- `title`
- `exportedAt`
- `chapters`

`chapters` 内每项包含：
- `order`
- `title`
- `fileName`

### `BookBackupManifest`

- `version`
- `exportedAt`
- `book`
- `chapters`

`book` 内包含：
- `title`
- `createdAt`
- `updatedAt`

`chapters` 内每项包含：
- `title`
- `order`
- `html`
- `markdown`
- `createdAt`
- `updatedAt`

## 持久化设计

### IndexedDB

项目使用 IndexedDB 作为唯一持久化层，不引入后端存储。

**对象存储：**
- `books`
- `chapters`

**仓储职责：**
- 查询书籍摘要
- 创建、删除、重命名书籍
- 导入整本书备份
- 创建、删除、重命名章节
- 调整章节顺序
- 更新章节 HTML，并同步生成 Markdown

### 设计原因

- 满足单用户、本地使用场景
- 降低部署复杂度
- 保持导出功能纯前端可用

## 核心交互流程

### 1. 创建书籍

用户在书架页点击“新建书籍”，通过模态框输入书名。确认后：
- 生成书籍记录
- 更新书架列表
- 自动跳转到该书的工作台

### 2. 创建与管理章节

工作台左侧为章节管理区，支持：
- 新建章节
- 重命名章节
- 删除章节
- 上移、下移章节顺序

章节采用单层顺序列表，不支持嵌套。

### 3. 编辑与自动保存

当前章节在右侧工作区编辑：
- 编辑态：HTML 输入
- 预览态：Markdown 预览

每次输入变化后：
- 若内容与持久化内容不同，则进入“未保存”状态
- 经过 800ms 防抖后自动保存
- 保存时调用 `convert(html)` 生成最新 Markdown
- 保存成功后更新书籍 `updatedAt`

切换章节前会先尝试冲刷待保存草稿，避免丢失。

### 4. 导出整本书

导出时：
- 先冲刷当前草稿
- 重新读取该书与全部章节
- 生成 zip 文件

zip 内内容：
- 每章一个 `.md`
- `README.md`
- `toc.json`
- `book.json`

其中 `book.json` 保存整本书的完整编辑态数据，用于后续重新导入：
- 书籍标题与时间戳
- 各章节顺序
- 各章节原始 HTML
- 各章节派生 Markdown

### 5. 导入整本书

导入时：
- 用户在书架页选择单个 `book.json`
- 系统校验其结构与版本
- 为导入结果生成新的书籍与章节 id
- 将其写入 IndexedDB
- 导入成功后自动进入该书的工作台

章节文件命名规则：
- `01-章节名.md`
- `02-章节名.md`

文件名会做安全清洗，并对重复标题追加序号。

## 模块设计

### `src/lib/converter.ts`

负责 HTML 转 Markdown 的纯字符串转换。

**职责：**
- 初始化 turndown 实例
- 注册 GFM 插件
- 处理 `pre` 代码块
- 处理 `details/summary`
- 移除样式、脚本、SVG 与平台代码块头部噪音

### `src/lib/books/model.ts`

负责领域层纯逻辑：
- 书名默认值规范化
- 章节标题默认值规范化
- 根据 HTML 生成更新后的章节 Markdown

### `src/lib/books/repository.ts`

负责 IndexedDB 仓储：
- 书籍 CRUD
- `book.json` 导入落库
- 章节 CRUD
- 排序与查询
- HTML 保存时同步写入 Markdown

### `src/lib/books/export.ts`

负责导出：
- 章节文件名生成
- `README.md` 内容生成
- `toc.json` 生成
- `book.json` 生成与解析
- zip 打包

### `src/components/books/BookShelf.tsx`

负责书架页：
- 书籍卡片渲染
- 新建书籍模态框
- 导入 `book.json`
- 删除确认弹窗

### `src/components/books/BookWorkspace.tsx`

负责工作台：
- 书名修改
- 章节列表交互
- HTML 编辑与自动保存
- Markdown 预览
- 导出整本书

### `src/components/HtmlEditor.tsx`

负责 HTML 输入：
- 文本编辑
- 上传 `.html/.htm`
- 拖拽导入
- 清空内容

### `src/components/MarkdownPreview.tsx`

负责 Markdown 预览：
- 预览渲染
- 复制 Markdown
- 下载当前 Markdown
- 单章下载文件名跟随章节标题
- 内容区域内部滚动

## 视觉设计

### 设计方向

整体视觉参考阅读类产品，而不是后台管理系统：
- 蓝白主色
- 扁平化
- 低装饰
- 内容优先
- 卡片与面板使用纯色底 + 细边框 + 少量阴影
- Markdown 预览区域采用更接近书页阅读的排版节奏，保留列表符号、编号与层级

### 色彩策略

**浅色模式：**
- 页面背景：极浅蓝灰
- 面板背景：白色
- 强调色：中蓝
- 文本：深蓝灰

**深色模式：**
- 页面背景：深蓝黑
- 面板背景：深蓝色块
- 强调色：浅蓝
- 文本：高对比浅色

### 结构原则

- 首页头部高度控制在较紧凑范围，不做大 Hero Landing
- 工作台为固定视口布局，避免整页滚动造成阅读区不稳定
- Markdown 预览滚动收敛到内容区内部
- 章节选中状态必须一眼可辨

### 深色模式策略

项目使用 `.dark` class 驱动深色模式，而不是仅依赖系统媒体查询。

**原因：**
- 用户可显式切换
- 组件层可保持主题一致
- Ant Design 主题可跟随同步切换

## 设计决策

### 1. 保留转换核心，替换产品外壳

转换器依然是产品核心能力，但从“单文件工具页”升级为“章节持久化工作流”的底层引擎。

### 2. 选择 IndexedDB 而不是服务端

当前需求明确是本地单用户工具，IndexedDB 复杂度最低，且足够支持书籍与章节管理。

### 3. Markdown 只作为派生数据

避免 HTML / Markdown 双向编辑导致状态冲突。HTML 是源数据，Markdown 是自动生成结果。

### 4. 导出 zip 采用轻量依赖

使用 `jszip` 让导出流程可靠、跨浏览器、可维护。

### 5. 视觉采用“扁平化蓝白阅读工具”

不走高饱和、重渐变、重阴影路线，保持简洁和内容可读性。

## 风险与权衡

- IndexedDB 适合单机场景，但不具备跨设备同步能力
- 当前章节结构为单层列表，后续若支持分卷需要迁移数据模型
- `rehypeRaw` 预览策略适合本地工具，但若未来接入外部内容分享，需要重新评估安全边界
- Ant Design 主要承担交互弹窗职责，若后续扩大使用范围，需要进一步统一组件风格
