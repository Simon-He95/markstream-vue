---
title: Legacy 构建与兼容性指南
description: 说明如何使用 legacy 构建提升 markstream-vue 在旧浏览器（如较低版本 iOS、Safari）中的兼容性及源码层的修复策略。
keywords:
  - legacy 构建
  - 浏览器兼容
  - Vite 兼容
---

# Legacy 构建与兼容性指南（Vite / Webpack）

目的
- 本文档说明如何使用 legacy 构建以增强旧浏览器（例如较低版本 iOS / Safari）的兼容性，以及何时应该在源码层修复问题。

重要提醒
- 部分问题（尤其是正则引擎级语法，如 lookbehind `(?<!...)`）无法通过 polyfill 修复。legacy 构建可以转换语法和注入 API polyfill，但不能向旧的 JS 运行时“增加”正则引擎特性。如果遇到这类问题，必须在源码层重写或延迟构造并运行时检测/回退。详见 `ios-regex-compat` 文档。

Vite（推荐）

安装：

```bash
pnpm add -D @vitejs/plugin-legacy
```

示例配置（`vite.config.ts`）：

```ts
import legacy from '@vitejs/plugin-legacy'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    legacy({
      targets: ['defaults', 'iOS >= 11'],
      additionalLegacyPolyfills: ['regenerator-runtime/runtime'],
      renderLegacyChunks: true,
    })
  ]
})
```

注意：
- `targets` 决定哪些语法/Polyfill 需要应用。根据需要支持的最低版本设置。
- `additionalLegacyPolyfills` 可以把运行时库注入到 legacy bundle。
- `renderLegacyChunks` 生成按需加载的 legacy chunk，并配合 `type="module"` / `nomodule` 差异化加载。
- 但 plugin-legacy 无法改写正则 lookbehind 等引擎级语法；此类问题仍需在源码层处理。

Webpack

常见做法是用 Babel 做两套构建（modern + legacy），通过 `type="module"` / `nomodule` 差异化服务。示例依赖与 `babel.config.js` 请参考英文文档上半部分。

Polyfills
- 使用 `core-js`（v3）和 Babel 的 `useBuiltIns: 'usage'`，并仅在 legacy 构建中注入需要的 polyfill。

正则语法特殊说明
- 引擎级正则语法必须在源码层处理：改写或运行时延迟构造并做 feature-detect。

测试与 CI
- 在 CI 中运行 modern + legacy 构建，并在旧设备/模拟器上做 smoke tests。可加入静态检查阻止新提交引入高级正则写法。

快速检查（本地）

```bash
pnpm dlx rg "\\(\\?<!|\\(\\?<=|\\\\p\\{" --glob "**/*.{js,ts,vue,jsx,tsx,mjs,cjs}" -n
```

总结
- 优先在源码层修复不兼容的正则语法；使用 legacy 构建来覆盖语法与 API 差异，并在 CI/QA 中验证旧设备表现。
