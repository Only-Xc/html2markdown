# html2md 设计文档

**创建日期：** 2026-03-17

## 背景与目标

当前仓库缺少一个可复用的命令行工具来将 HTML 内容稳定地转换为 Markdown。为了支持单文件处理和批量文档迁移，需要引入明确的 CLI 接口、可预期的输出规则，以及适合脚本化使用的错误处理行为。

**目标：**
- 提供一个 `html2md` CLI，支持单文件与批量目录两种模式
- 将 HTML 转 Markdown 的规则集中在单独的转换模块中，保证 CLI 层只负责 I/O 和流程控制
- 在批量模式下保留目录结构、跟随符号链接并避免循环递归
- 提供稳定的退出码和错误输出，便于脚本与 CI 调用

**非目标：**
- 不实现增量同步、监听目录或并行转换
- 不保留任意 HTML 标签的原始结构，只保留规范中列出的可映射语义和文本内容
- 不构建编译产物发布流程，以 `tsx` 直接执行源码为主

## 技术栈

- **语言：** TypeScript
- **运行时：** Node.js，使用 `tsx` 直接执行（无需编译）
- **核心库：**
  - `turndown` — HTML 转 Markdown
  - `turndown-plugin-gfm` — GFM 扩展（表格、删除线、任务列表）
  - `commander` — CLI 参数解析

## CLI 接口

```bash
# 使用默认目录（./input → ./output）
html2md

# 指定目录
html2md -i ./my-html -o ./my-md

# 单文件，输出到指定文件
html2md input.html -o output.md

# 单文件，未指定 -o 时输出到 stdout
html2md input.html
```

### 参数说明

| 参数 | 简写 | 默认值 | 说明 |
|------|------|--------|------|
| 位置参数（可选） | — | 无 | 单文件模式的输入文件路径，与 `-i` 互斥 |
| `--input` | `-i` | `./input` | 输入目录路径（批量模式） |
| `--output` | `-o` | `./output`（批量）/ 无（单文件） | 输出目录或文件路径 |

### 模式判断规则

- 提供**位置参数**：进入单文件模式
  - 同时提供 `-i`：打印错误 `Cannot use positional argument and -i together`，退出码 1
  - `-o` 未指定：输出到 stdout
  - `-o` 为已存在目录：输出 `<dir>/<inputName>.md`
  - `-o` 为不存在且无扩展名路径：视为目录，自动创建，输出 `<dir>/<inputName>.md`
  - `-o` 为文件路径（有扩展名或已存在文件）：直接写入该路径
- 未提供位置参数：进入批量模式

### 覆盖策略与编码

- 输出文件已存在时**直接覆盖**，不提示
- 读取 HTML 文件统一使用 **UTF-8** 编码

## 模块设计

### `converter.ts`

封装 turndown 实例（模块级单例），导出 `convert(html: string): string`。

**配置：**
- `headingStyle: "atx"`、`codeBlockStyle: "fenced"`
- 注册 `turndown-plugin-gfm` 插件

**移除的节点（无输出）：**
- `<style>`、`<script>`、`<noscript>`
- SVG 节点
- `.code-block-extension-header`（掘金/CSDN 等平台代码块头部 chrome）

**自定义规则：**

| 规则 | 匹配 | 输出 |
|------|------|------|
| `preformattedCode` | `<pre>` | 从 `<code class="language-*">` 提取语言标识，生成 fenced code block |
| `details` | `<details>` | `<summary>` 内容 → `**加粗标题**`，其余内容递归转换后展开；无 `<summary>` 时直接展开 |

**支持的 HTML 元素：**
- 标题 h1-h6、段落 p、换行 br
- 有序/无序/嵌套列表 ol/ul/li
- 链接 a、图片 img
- 代码 code、代码块 pre
- 表格 table/tr/td/th（GFM 格式）
- 加粗 strong/b、斜体 em/i、删除线 del/s
- 引用块 blockquote、分割线 hr
- 无法映射的标签（div、span 等）：保留文本内容，丢弃标签

### `batch.ts`

**公共 API：**
- `scanHtmlFiles(dir, onWarning?)` — 递归扫描，返回所有 `.html` 文件的绝对路径（已排序）
- `resolveOutputPath(inputFile, inputDir, outputDir)` — 保留相对目录结构，`.html` → `.md`
- `formatDisplayPath(targetPath, cwd?)` — 相对于 cwd 展示路径，超出则显示绝对路径
- `processBatch(inputDir, outputDir)` — 主流程：扫描 → 串行转换 → 统计结果

**批量模式行为：**
- 递归扫描跟随符号链接；通过 `realpath` + `Set<string>` 检测循环，发现时输出警告并跳过
- 保留子目录结构：`input/docs/a.html` → `output/docs/a.md`
- 输出目录不存在时自动创建；输出路径已存在且为普通文件时报错退出码 1
- 进度输出到 **stderr**，格式：`[1/5] input/docs/a.html → output/docs/a.md`
- 单文件失败时记录错误并继续；完成后打印汇总：`Done: X succeeded, Y failed`

### `index.ts`

**公共 API：**
- `resolveSingleFileOutputPath(inputFile, output)` — 处理目录/文件/不存在路径的判断逻辑
- `main(argv?)` — CLI 主入口

**职责：** 使用 `commander` 定义参数，判断模式，调用 `convert()` 或 `processBatch()`，处理单文件 I/O。

## 错误处理

| 场景 | 行为 | 退出码 |
|------|------|--------|
| 输入文件/目录不存在或无读权限 | 打印错误到 stderr | 1 |
| 位置参数与 `-i` 同时使用 | 打印错误到 stderr | 1 |
| 批量输出路径已存在且为普通文件 | 打印错误到 stderr | 1 |
| 批量模式某文件失败 | 打印错误到 stderr，继续处理 | — |
| 批量完成有失败文件 | `Done: X succeeded, Y failed` | 1 |
| 批量完成全部成功 | `Done: X succeeded, 0 failed` | 0 |
| 输入目录为空 | `No HTML files found in <dir>` | 0 |
| 符号链接循环 | `Warning: Skipping cyclic symlink <path>` | — |

## 设计决策

### 1. 模块拆分为三个文件

`index.ts` 负责 CLI 和单文件 I/O，`converter.ts` 封装转换规则，`batch.ts` 负责批量流程。转换逻辑独立于文件系统，降低测试和扩展成本。

备选：将全部逻辑写在单文件中。未采用，耦合度高，后续修改风险大。

### 2. 使用 turndown + GFM 插件，并为 details/summary 添加自定义规则

标准库覆盖大部分映射，GFM 插件满足表格和任务列表。`details/summary` 通过自定义规则在转换阶段完成，避免在 CLI 层做额外 HTML 字符串处理。

备选：手写完整转换器。未采用，维护成本过高。

### 3. 批量模式串行处理

串行执行保证 stderr 进度输出顺序与统计一致，实现复杂度低。工具主要用于离线文档迁移，吞吐量不是首要约束。

备选：并发处理。未采用，错误聚合和输出顺序更复杂。

### 4. 使用真实路径集合检测符号链接循环

`realpath` + 已访问目录集合，可在跟随符号链接时识别循环并跳过，同时不影响普通文件扫描。

### 5. 文件读写统一在 index.ts 和 batch.ts 处理

`converter.ts` 只处理字符串，所有文件操作由调用方负责，编码和错误处理保持一致。

## 风险与权衡

- 符号链接扫描只对目录维护访问集合，避免因重复真实路径漏扫普通文件
- `details/summary` 采用"加粗标题 + 展开正文"的固定输出策略，非标准 Markdown 一一映射
- 未引入编译步骤，运行依赖 `tsx`；通过 `package.json` 提供明确脚本保证使用路径清晰
