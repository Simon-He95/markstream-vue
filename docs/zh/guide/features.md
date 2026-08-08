# 特性

- ⚡ **超高性能**：针对流式场景优化，最小化重渲染和 DOM 更新
- 🌊 **流式优先设计**：原生支持增量/不完整的 Token 化 Markdown
- 🧠 **stream-diffs 流式更新**：为大代码块提供平滑的增量更新体验
- 🪄 **渐进式 Mermaid**：图表在语法可用时尽快渲染并逐步完善
- 🪄 **渐进式 D2**：语法可用即预览，失败时保留上次成功渲染
- 🧩 **自定义组件**：允许在 Markdown 内容中嵌入 Vue 组件
-- 📝 **完整 Markdown 支持（可选 Emoji 插件）**：表格、公式、复选框、代码块等。Emoji 支持现作为插件提供，默认不启用，需要在 `getMarkdown` 配置或通过组件的 `customMarkdownIt` prop 显式注册 `markdown-it-emoji`。
- 🔌 **零配置出箱**：适用于 Vue 3 项目

要了解更多示例，请查看文档页：`/zh/guide/usage`、`/zh/guide/features`。
