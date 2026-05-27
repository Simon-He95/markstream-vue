# Audit A Markstream Integration

Use when Markstream is already present but something feels off.

## 中文模板

```text
请审计这套 Markstream 接入。
重点检查：包和 peers 是否匹配、CSS 顺序是否正确、Tailwind/UnoCSS layer 是否安全、KaTeX CSS 是否缺失、Monaco / Mermaid / D2 是否在正确的客户端边界内初始化。
同时判断这里应该继续用 `content`，还是应该改成 `nodes` + `final`（大多数流式聊天优先用 `content` + 内置 smooth streaming；只有 worker 预解析、自定义 AST 或独立状态层接管解析时，才优先用 `nodes` + `final`）。
如果已经存在自定义组件覆盖，请检查是否应该改成 scoped `custom-id`。
最后给出最小修复集，而不是泛泛建议。
```

## English template

```text
Audit this Markstream integration.
Check whether the package and peers match the actual features, whether CSS order and Tailwind or UnoCSS layers are safe, whether KaTeX CSS is missing, and whether Monaco, Mermaid, or D2 are initialized behind the correct client-only boundaries.
Also decide whether this surface should stay on `content` or move to `nodes` plus `final` (prefer `content` with built-in smooth streaming for most AI chat / token streaming; use `nodes` plus `final` only for worker-preparsed content, shared AST stores, or custom AST control).
If custom overrides already exist, review whether they should be scoped with `custom-id`.
Finish with the smallest concrete fix set instead of general advice.
```
