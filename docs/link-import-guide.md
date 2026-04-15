# 链接采集增强说明

**更新日期：** 2026-04-15

本文档只记录本轮“链接采集增强”的具体增量，通用能力请以 [design.md](./design.md) 和 [spec.md](./spec.md) 为准。

本轮增量包括：

- 入口改造：链接采集从主编辑区切换项改为弹窗入口
- 交互收敛：提取与选取统一为“预览后导入”
- 选区增强：片段选取支持完整路径展示与父级/子级切换
- 页面说明收缩：改为一段简短说明 + 按钮悬浮提示
- 开发态稳定性优化：代理 iframe 改为 `srcDoc` 注入

## 1. 为什么要改

在进入这一轮之前，链接采集存在几个具体问题：

1. 入口和“手动输入”耦合在一起，主编辑区结构偏重。
2. 只要提取成功，就会直接覆盖当前章节，缺少确认步骤。
3. 片段选取只能以当前节点为准，不方便快速扩大到父级容器。
4. 页面说明偏长，默认状态下信息密度过高。
5. 开发态 iframe 容易受到 HMR / overlay 干扰。

本轮改造的目标不是单纯“加按钮”，而是把链接采集做成一条可解释、可回退、可扩展的链路。

## 2. 本轮用户侧改动

### 2.1 入口位置

- HTML 编辑器顶部保留“上传文件”
- 在其旁边新增“链接采集”
- 点击后通过 `Modal` 打开独立采集窗口

这样做的好处：

- 不再占用主编辑区的常驻结构
- 手动 HTML 输入保持简单
- 链接采集作为“高级导入方式”单独承载

### 2.3 预览后导入

这次最重要的交互收敛是：

- 提取正文后，不直接覆盖当前章节
- 选取片段后，也不直接覆盖当前章节
- 两条路径统一进入预览区
- 只有点击“导入正文”才会真正写入当前章节

这样可以避免误操作覆盖当前内容。

### 2.4 片段选取的父级上溯

针对“局部元素容易选到太小的节点”这个问题，新增了：

- 完整标签路径展示
- `选择父级`
- `选择子级`

工作方式：

1. 用户在 `iframe` 中点中一个元素
2. 系统收集该元素到 `body` 之间的祖先链
3. 生成每一层对应的 HTML 片段
4. 在预览区中显示当前层级路径
5. 用户可以直接在预览区里切换到父级或退回子级

示例路径：

```text
body > main.article-container > article.content > div.rich-text > p:nth-of-type(3)
```

这比让用户反复回到 `iframe` 中重新点更稳定。

### 2.5 页面说明与悬浮提示

这轮还收了提示层级：

- 页面内只保留一段简短说明
- 主要按钮保留悬浮提示
- 详细规则不再直接堆在弹窗正文里

这样默认更干净，但第一次使用时仍然有足够引导。

## 3. 这次实际改到的文件

- `src/components/HtmlEditor.tsx`
  - 新增“链接采集”按钮
- `src/components/books/BookWorkspace.tsx`
  - 新增链接采集弹窗
- `src/components/LinkImportPanel.tsx`
  - 链接采集主界面
  - 双路径逻辑
  - 预览与导入控制
  - 标签路径与父级切换
  - 页面说明与 Tooltip 提示
- `src/app/api/proxy/page/route.ts`
  - 代理页面抓取
  - 风控识别
- `src/app/api/proxy/extract/route.ts`
  - 新增正文提取接口
- `src/lib/proxy.ts`
  - 选取结果路径与层级管理

## 4. 这次新增的关键数据结构

## 4.1 `PreviewFragment`

```ts
interface PreviewFragment {
  mode: "picked" | "extracted";
  html: string;
  path?: string;
  pickedLevels?: PickedLevel[];
  pickedLevelIndex?: number;
}
```

含义：

- `mode`
  - 区分是正文提取还是 DOM 选取
- `html`
  - 当前预览中的 HTML
- `path`
  - 当前选取层级对应的完整标签路径
- `pickedLevels`
  - 从当前节点到父节点的层级候选
- `pickedLevelIndex`
  - 当前预览停留在哪一层

## 4.2 `PickedLevel`

```ts
interface PickedLevel {
  html: string;
  tagName: string;
  path: string;
}
```

含义：

- `html`
  - 当前层级实际导入的 HTML
- `tagName`
  - 当前层级节点标签名
- `path`
  - 用于给用户解释“现在选到的是哪一层”

## 5. 这次踩到的实现问题

### 5.1 开发态 iframe 干扰

在开发态，Next 的 HMR / overlay 可能通过 HTML 导航污染代理 iframe。

为降低这个问题：

- 不再让 iframe 直接导航到 `/api/proxy/page?...`
- 改为前端先拉取代理 HTML
- 再通过 `srcDoc` 注入 iframe

### 5.2 不要把复杂 UI 状态直接塞进原始选取结果

这次交互演进说明一件事：

- “点选结果”
- “预览状态”
- “可上溯路径”

其实不是同一层概念。

比较稳的做法是：

1. 先得到原始结果
2. 再构造成统一的预览结构
3. 最终由导入动作决定是否写入章节

## 6. 学习建议

如果后人要继续扩展这一块，建议先按下面顺序理解：

1. 看 `src/components/books/BookWorkspace.tsx`
   - 先理解采集弹窗是如何接入工作台的
2. 看 `src/components/HtmlEditor.tsx`
   - 理解采集入口为什么放在这里
3. 看 `src/components/LinkImportPanel.tsx`
   - 这是主流程核心
4. 看 `src/lib/proxy.ts`
   - 理解链接采集底层工具函数
5. 看 `src/app/api/proxy/page/route.ts` 与 `src/app/api/proxy/extract/route.ts`
   - 理解这次增强依赖的服务端入口

## 7. 后续可扩展方向

可继续做的方向包括：

- 把标签路径做成可点击 breadcrumb，而不是只靠父级/子级按钮切换
- 给正文预览增加 Markdown 预览切换
- 为常见中文内容站点增加站点级正文抽取规则
- 对 `iframe` 选取结果增加“保留兄弟节点 / 合并相邻段落”能力
- 对图片、代码块、表格增加更强的抽取后修正
- 在弹窗内保留导入前后的 diff 或覆盖提醒

## 8. 总结

这次“链接采集增强”本质上做了三件事：

1. 把入口从主编辑区切换，改成更合理的弹窗式导入工具
2. 把导入行为从“立即覆盖”改成“统一预览后确认”
3. 把原来不可解释的失败和难以微调的点选，改成更可解释、可上溯、可维护的链路

后人如果只记一条原则，应该记这句：

> 采集功能的核心不是“尽快把 HTML 塞进章节”，而是“让用户清楚知道系统抓到了什么，并且能在导入前控制结果”。
