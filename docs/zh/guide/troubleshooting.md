# 排查问题

如果出现问题，请尝试下面这些通用解决方案：

- 在 SSR 中出现 `window is not defined`：在 Nuxt 中将客户端代码包装为 `<client-only>`，在 Vite SSR 场景中用 `onMounted` 延迟初始化。
- 数学渲染失败：安装并引入 `katex`，同时在应用入口引入 `katex/dist/katex.min.css`。
- Mermaid 渲染问题：升级到 `mermaid` >= 11，检查异步渲染日志。
- 若通过 CDN `<script>` 引入 KaTeX/Mermaid：确保首次渲染前 `window.katex` / `window.mermaid` 已就绪；或在加载完成后调用一次 `setKatexLoader(() => window.katex)` / `setMermaidLoader(() => window.mermaid)` 来重置 loader。
- 性能问题：确认 `viewportPriority` 已启用，避免在单次 mount 中渲染大量重资产节点。

## 常见问题（FAQ）

- Tailwind / CSS 覆盖样式：当项目使用 Tailwind 或组件库（如 shadcn）时，Tailwind 的工具类或全局样式可能会覆盖库本身的样式。请参考 Tailwind 集成指南以了解样式导入顺序和解决策略：`/zh/guide/tailwind`。

  快速修复：

  - 将 `markstream-vue/index.css` 放进 `@layer components { ... }`（详见 Tailwind 页面），稳定 CSS 顺序。
  - Tailwind 里设置 `prefix`（例如 `tw-`）减少与组件库 class 冲突。
  - 用容器选择器或 `:deep` 把覆盖范围限制在渲染区域。

  说明：`markstream-vue` 的打包 CSS 会限定在内部 `.markstream-vue` 容器下（包含主题变量与 Tailwind 工具类），因此大多数冲突通常来自 reset/导入顺序在渲染区域内的覆盖，而不是库在全局“泄漏”样式。

- 自定义样式：你可以通过覆盖 `src/index.css` 中的 CSS 变量来自定义外观（例如 `--vscode-editor-background`、`--vscode-editor-foreground`），或在你的应用样式中覆盖组件类。推荐使用 `@apply` 或将自定义样式限定到某个容器内。
- 插槽优先：如果你需要更改组件内布局，先检查组件是否暴露了插槽（例如 `header-left`、`header-right`、`loading`）。插槽提供稳健的扩展点，无需替换组件内部实现。

- 还是不够？试试 `setCustomComponents(id, mapping)` 将节点渲染器替换为你自己的 Vue 组件，详见 `Advanced` 页面的示例；记得在 SPA 中及时 `removeCustomComponents` 清理映射以避免内存泄露。

  快速示例（将 `code_block` 节点替换为自定义渲染器）：

  ```ts
  import { setCustomComponents } from 'markstream-vue'

  setCustomComponents('my-docs', {
    code_block: MyCustomCodeBlock,
  })
  ```

  这将告知所有带有 `custom-id="my-docs"` 的 `MarkdownRender` 实例，使用 `MyCustomCodeBlock` 渲染 `code_block` 节点；更多示例请参见 `Advanced` 页面。

- 重现与提单：遇到渲染异常或报错时，请先在 `playground` 中尝试复现问题并提供最小 Markdown 示例（或使用托管的快速测试页面）。可以运行 `pnpm test` 进行本地测试以确认是否为回归问题。打开 issue 时请包含：

  1. 可复现的最小 Markdown 示例（粘贴在 issue 中或放到 gist）。
  2. 在 playground 的复现步骤或 `playground` 链接，以及运行环境信息（浏览器、Node 版本、Vite/Nuxt）。
  3. 错误堆栈或 console 输出。

  优先提供一个 `playground` 对应的复现链接；你也可以使用托管的快速测试以便快速调试：

  https://markstream-vue.simonhe.me/test

  如果准备好了，使用快速创建 issue 链接：

  https://github.com/Simon-He95/markstream-vue/issues/new?template=bug_report.yml

  额外建议：如果你可以编写一个单测或集成测试来复现 bug，请将其放入 `test/` 文件夹并在本地运行 `pnpm test`，这通常能帮助维护者快速定位并修复回归。

## 样式错乱？先做这几件事 {#css-looks-wrong-start-here}

绝大部分渲染问题都源自 CSS 重置缺失、导入顺序不对，或者 Tailwind / UnoCSS 等工具类框架覆盖组件样式。提问前请按以下清单排查：

1. **导入 reset** —— 浏览器默认 `p`、`dl`、`table`、`pre` 的 margin/padding 各不相同。先引入 reset（`modern-css-reset`、`@unocss/reset`、`@tailwind base`），再引入 `markstream-vue`：

```css
@import 'modern-css-reset';
@tailwind base;
@tailwind components;

@import 'markstream-vue/index.css';
```

2. **使用 CSS layer** —— Tailwind/UnoCSS 在 `@layer components`/`utilities` 中输出工具类，如果包的 CSS 在这些 layer 之前导入，样式可能被覆盖。把库的样式包裹在 layer 里：

```css
@layer components {
  @import 'markstream-vue/index.css';
}
```

UnoCSS 也可以通过 `preflights` 注入：

```ts
import { defineConfig, presetUno } from 'unocss'

export default defineConfig({
  presets: [presetUno()],
  preflights: [
    {
      layer: 'components',
      getCSS: () => '@import "markstream-vue/index.css";',
    },
  ],
})
```

3. **确认同伴 CSS** —— Monaco、KaTeX、Mermaid 都有自己的样式文件。缺少时会表现为空白编辑器或无样式公式。对照组件指南确认已引入对应 CSS。

4. **用 `custom-id` 限定覆盖范围** —— 集成到大型设计系统时，其他全局样式可能影响渲染器。给 `MarkdownRender` 传 `custom-id="docs"`，再通过 `[data-custom-id="docs"]` 编写覆盖，可避免污染其它页面。

如果上述步骤仍无法解决，请使用 `pnpm play` 启动 playground，准备一个只包含 CSS/Markdown 的最小示例并附带链接提 issue。
