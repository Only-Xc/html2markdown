# `@html2md/core`

可复用的 HTML 转 Markdown 转换包。

- 支持浏览器与 Node 环境
- 稳定入口：`convert(html: string): string`
- `null` 和 `undefined` 会返回空字符串
- 其他非字符串输入会先转成字符串再处理

```ts
import { convert } from "@html2md/core";

const markdown = convert("<h1>Hello</h1>");
```

常见行为：

- 空字符串、纯空白、纯注释输入返回 `""`
- 自动移除 `style`、`script`、`noscript`、`svg`、`template` 等噪音节点
- 保留 GFM 表格、任务列表、代码块和 `details/summary`
