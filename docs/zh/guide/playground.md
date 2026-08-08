---
description: 使用本地和在线 playground 快速复现 markstream-vue 渲染问题、对比框架接入，并验证修复结果。
---

# Playground（示例演示）

仓库包含一个可交互的 `playground` 演示，用于本地调试和复现渲染问题。

## 在线演示

- Vue 3: https://markstream-vue.simonhe.me/
- React: https://markstream-react.pages.dev/
- React migration demo: https://markstream-react.pages.dev/migration-demo
- Nuxt: https://markstream-nuxt.pages.dev/
- Vue 2: https://markstream-vue2.pages.dev/

## 本地运行

运行演示：

```bash
pnpm install
pnpm play
# 打开终端中显示的网址（通常为 http://localhost:5173）
```

在演示中你可以尝试：

- 实时流式 Markdown 输入
- 渐进式 Mermaid
- 自定义组件映射
- stream-diffs 增强代码块集成示例

可直接打开的示例页面：

- `https://markstream-react.pages.dev/migration-demo`：面向 `react-markdown` 用户的 before / after 迁移演示
