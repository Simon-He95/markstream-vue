# Tailwind 集成与样式顺序

如果你的项目使用 Tailwind 或基于 Tailwind 的组件库（如 shadcn），可能会遇到样式覆盖问题。推荐将 `markstream-vue` 的 CSS 导入置于 `@layer components { ... }` 中以控制样式优先级。

另外，`markstream-vue` 的打包 CSS 会限定在内部 `.markstream-vue` 容器下以降低全局冲突；来自 `markstream-vue/index.css` 的 Tailwind 工具类只会在该容器内生效。

示例：

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer components {
  @import 'markstream-vue/index.css';
}
```

更多替代方案：使用 `prefix` 配置以避免类名冲突，或在应用层覆盖样式。

## 在 Tailwind 中避免重复生成 CSS

为了在使用 Tailwind 的项目中减少重复的 utility CSS，推荐优先使用本包提供的 "tailwind-ready" 输出，而不是完整的预编译 `index.css`。

- Tailwind v3（推荐流程）：
  - 在应用中引入 `index.tailwind.css`，这样只会引入组件样式而不会把 Tailwind 的工具类重复打包进去。
  - 在 `tailwind.config.js` 的 `content` 中加入本包生成的类列表，使 Tailwind 能识别并避免重新生成相同的类。

示例（Tailwind v3 / `tailwind.config.js`）：

```js
module.exports = {
  content: [
    './src/**/*.{js,ts,vue}',
    // 包安装后可以使用：require('markstream-vue/tailwind')
    require('markstream-vue/tailwind'),
  ],
}
```

示例 CSS 导入（应用入口）：

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@import 'markstream-vue/index.tailwind.css';
```

- Tailwind v4：可以直接包含 `index.tailwind.css`，使用 v4 的扫描器发现类名，无需额外的 `tailwind.ts` 辅助文件。

- 非 Tailwind 项目：继续使用预编译好的 `index.css`：

```css
@import 'markstream-vue/index.css';
```

说明：
- 本包导出 `./tailwind` 条目（`./dist/tailwind.ts`），导出的是提取出的 class 列表。发布到 npm 后可以在 `tailwind.config.js` 中通过 `require('markstream-vue/tailwind')` 引入该列表。
- 在本地开发时也可以直接引用生成文件（例如 `./dist/tailwind.ts`）。

## UnoCSS 集成

UnoCSS 遵循相同规则：先导入 reset，再将库的 CSS 放到受控 layer 中，避免被 `utilities` 覆盖。

1. 在 `uno.config.ts` 中注入 `preflights`：

```ts
import { defineConfig, presetUno, presetWind } from 'unocss'

export default defineConfig({
  presets: [presetUno(), presetWind()],
  preflights: [
    {
      layer: 'preflights',
      getCSS: () => '@import "markstream-vue/index.css";',
    },
  ],
})
```

2. 或者手动在样式表中声明：

```css
@import '@unocss/reset/tailwind.css';

@layer components {
  @import 'markstream-vue/index.css';
}
```

3. 当类名与 Uno/Tailwind 冲突时，可以在配置中设置 prefix（如 Tailwind `prefix: 'tw-'`，Uno 通过 `shortcutsPrefix` 或自定义规则），或者将 `MarkdownRender` 包裹在 `custom-id` 上下文中再进行覆盖。

调试技巧：在浏览器 DevTools 中打开 “Cascade Layers” 面板，确认 `markstream-vue` 的样式位于 utilities 之上。如果不在正确层级，请调整导入位置或 `preflights` 顺序。
