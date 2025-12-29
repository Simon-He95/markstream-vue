import process from 'node:process'
import { defineConfig } from 'vitepress'

// TypeScript sometimes rejects VitePress site locales on the `Config` type.
// Cast to `any` to avoid strict type errors in the docs config while keeping intellisense.
export default defineConfig({
  title: 'markstream-vue',
  description: 'Streaming-friendly Markdown renderer for Vue 3 — progressive Mermaid, streaming diff code blocks',
  // Support deploying under a sub-path (for GitHub Pages like /username/repo/)
  base: process.env.VITEPRESS_BASE || '/',
  locales: {
    root: {
      label: 'English',
      lang: 'en-US',
      title: 'markstream-vue',
      description: 'Streaming-friendly Markdown renderer for Vue 3',
      link: '/',
    },
    zh: {
      label: '简体中文',
      lang: 'zh-CN',
      title: 'markstream-vue',
      description: '适用于 Vue 3 的流式 Markdown 渲染器',
      link: '/zh/',
    },
  },
  themeConfig: {
    logo: '/logo.svg',
    // Basic search is enabled by default. Use the 'local' provider for on-device search
    // or configure Algolia DocSearch by setting provider: 'algolia' and the options below.
    search: {
      provider: 'local',
    },

    nav: [
      { text: 'Get started', link: '/guide/quick-start' },
      { text: 'Examples', link: '/guide/examples' },
      { text: 'API', link: '/guide/components' },
      { text: 'Playground', link: 'https://markstream-vue.simonhe.me/' },
      { text: 'Search', link: '/guide/search' },
      { text: 'GitHub', link: 'https://github.com/Simon-He95/markstream-vue' },
      {
        text: 'Languages',
        items: [
          { text: 'English', link: '/guide/' },
          { text: '简体中文', link: '/zh/guide/' },
        ],
      },
    ],
    sidebar: {
      '/guide/': [
        {
          text: 'User Guide',
          items: [
            { text: 'Introduction', link: '/guide/' },
            { text: 'Installation', link: '/guide/installation' },
            { text: 'Quick Start', link: '/guide/quick-start' },
            { text: 'Why use it?', link: '/guide/why' },
            { text: 'Compared', link: '/guide/compared' },
            { text: 'Usage & API', link: '/guide/usage' },
            { text: 'Parser & API', link: '/guide/parser' },
            { text: 'Parser API (deep-dive)', link: '/guide/parser-api' },
            { text: 'Features', link: '/guide/features' },
            { text: 'Props & Options', link: '/guide/props' },
            { text: 'Code block header', link: '/guide/codeblock-header' },
            { text: 'Examples', link: '/guide/examples' },
            { text: 'Playground', link: '/guide/playground' },
            { text: 'Docs assets', link: '/guide/docs-style' },
            { text: 'VitePress docs playbook', link: '/guide/vitepress-docs' },
            { text: 'Contributing', link: '/guide/contributing' },
            { text: 'Translation guide', link: '/guide/translation' },
            { text: 'Deploy docs', link: '/guide/deploy' },
            { text: 'API Reference', link: '/guide/components' },
            { text: 'Advanced', link: '/guide/advanced' },
            { text: 'Monaco Internals', link: '/guide/monaco-internals' },
            { text: 'Math', link: '/guide/math' },
            { text: 'Mermaid', link: '/guide/mermaid' },
            { text: 'MermaidBlockNode', link: '/guide/mermaid-block-node' },
            { text: 'MermaidBlockNode (override)', link: '/guide/mermaid-block-node-override' },
            { text: 'Mermaid export demo', link: '/guide/mermaid-export-demo' },
            { text: 'Tailwind', link: '/guide/tailwind' },
            { text: 'Legacy builds & iOS regex compatibility', link: '/guide/legacy-builds' },
            { text: 'Thanks', link: '/guide/thanks' },
          ],
        },
        {
          text: 'Quick links',
          items: [
            { text: 'Examples', link: '/guide/examples' },
            { text: 'API Reference', link: '/guide/components' },
            { text: 'Playground', link: 'https://markstream-vue.simonhe.me/' },
            { text: 'Troubleshooting', link: '/guide/troubleshooting' },
          ],
        },
        { text: 'Nuxt SSR', link: '/nuxt-ssr' },
        { text: 'Performance', link: '/guide/performance' },
        { text: 'Monaco', link: '/guide/monaco' },
        { text: 'Troubleshooting', link: '/guide/troubleshooting' },
        {
          text: 'Investigations',
          items: [
            { text: 'e2e testing report', link: '/e2e-testing-report' },
            { text: 'KaTeX worker performance', link: '/katex-worker-performance-analysis' },
            { text: 'Monorepo migration', link: '/monorepo-migration' },
          ],
        },
      ],
      '/zh/guide/': [
        {
          text: '指南',
          items: [
            { text: '简介', link: '/zh/guide/' },
            { text: '安装', link: '/zh/guide/installation' },
            { text: '快速开始', link: '/zh/guide/quick-start' },
            { text: '为什么使用？', link: '/zh/guide/why' },
            { text: '对比', link: '/zh/guide/compared' },
            { text: '使用与 API', link: '/zh/guide/usage' },
            { text: '解析器概览', link: '/zh/guide/parser' },
            { text: '解析器 API 深入', link: '/zh/guide/parser-api' },
            { text: '功能', link: '/zh/guide/features' },
            { text: 'Props 与 Options', link: '/zh/guide/props' },
            { text: '代码块头部', link: '/zh/guide/codeblock-header' },
            { text: '示例', link: '/zh/guide/examples' },
            { text: 'Playground', link: '/zh/guide/playground' },
            { text: 'Docs 资源', link: '/zh/guide/docs-style' },
            { text: 'VitePress 文档指南', link: '/zh/guide/vitepress-docs' },
            { text: '贡献指南', link: '/zh/guide/contributing' },
            { text: '翻译指南', link: '/zh/guide/translation' },
            { text: '部署文档', link: '/zh/guide/deploy' },
            { text: 'API 参考', link: '/zh/guide/components' },
            { text: '高级', link: '/zh/guide/advanced' },
            { text: 'Monaco 内部', link: '/zh/guide/monaco-internals' },
            { text: 'Math', link: '/zh/guide/math' },
            { text: 'Mermaid', link: '/zh/guide/mermaid' },
            { text: 'MermaidBlockNode', link: '/zh/guide/mermaid-block-node' },
            { text: '覆盖 MermaidBlockNode（示例）', link: '/zh/guide/mermaid-block-node-override' },
            { text: 'Mermaid 导出示例', link: '/zh/guide/mermaid-export-demo' },
            { text: 'Tailwind', link: '/zh/guide/tailwind' },
            { text: 'Legacy 构建与 iOS 正则兼容', link: '/zh/guide/legacy-builds' },
            { text: '致谢', link: '/zh/guide/thanks' },
            {
              text: '研究与调查',
              items: [
                { text: 'e2e 测试与分析', link: '/zh/guide/e2e-testing-report' },
                { text: 'KaTeX Worker 性能', link: '/zh/guide/katex-worker-performance-analysis' },
                { text: 'Monorepo 迁移', link: '/zh/guide/monorepo-migration' },
              ],
            },
          ],
        },
      ],
      '/': [
        {
          text: 'User Guide',
          items: [
            { text: 'Introduction', link: '/guide/' },
            { text: 'Installation', link: '/guide/installation' },
            { text: 'Quick Start', link: '/guide/quick-start' },
            { text: 'Why use it?', link: '/guide/why' },
            { text: 'Compared', link: '/guide/compared' },
            { text: 'Usage & API', link: '/guide/usage' },
            { text: 'Parser & API', link: '/guide/parser' },
            { text: 'Parser API (deep-dive)', link: '/guide/parser-api' },
            { text: 'Features', link: '/guide/features' },
            { text: 'Props & Options', link: '/guide/props' },
            { text: 'Code block header', link: '/guide/codeblock-header' },
            { text: 'Examples', link: '/guide/examples' },
            { text: 'Playground', link: '/guide/playground' },
            { text: 'Docs assets', link: '/guide/docs-style' },
            { text: 'VitePress docs playbook', link: '/guide/vitepress-docs' },
            { text: 'Contributing', link: '/guide/contributing' },
            { text: 'Translation guide', link: '/guide/translation' },
            { text: 'Deploy docs', link: '/guide/deploy' },
            { text: 'API Reference', link: '/guide/components' },
            { text: 'Advanced', link: '/guide/advanced' },
            { text: 'Monaco Internals', link: '/guide/monaco-internals' },
            { text: 'Math', link: '/guide/math' },
            { text: 'Mermaid', link: '/guide/mermaid' },
            { text: 'MermaidBlockNode', link: '/guide/mermaid-block-node' },
            { text: 'MermaidBlockNode (override)', link: '/guide/mermaid-block-node-override' },
            { text: 'Tailwind', link: '/guide/tailwind' },
            { text: 'Legacy builds & iOS regex compatibility', link: '/guide/legacy-builds' },
            { text: 'Thanks', link: '/guide/thanks' },
          ],
        },
        { text: 'Nuxt SSR', link: '/nuxt-ssr' },
        { text: 'Performance', link: '/guide/performance' },
        { text: 'Monaco', link: '/guide/monaco' },
        { text: 'Troubleshooting', link: '/guide/troubleshooting' },
        {
          text: 'Investigations',
          items: [
            { text: 'e2e testing report', link: '/e2e-testing-report' },
            { text: 'KaTeX worker performance', link: '/katex-worker-performance-analysis' },
            { text: 'Monorepo migration', link: '/monorepo-migration' },
          ],
        },
      ],
    },
    locales: {
      root: {
        selectText: 'Languages',
        label: 'English',
        ariaLabel: 'Select language',
        nav: [
          { text: 'Get started', link: '/guide/quick-start' },
          { text: 'Examples', link: '/guide/examples' },
          { text: 'API', link: '/guide/components' },
          { text: 'Playground', link: 'https://markstream-vue.simonhe.me/' },
          { text: 'Search', link: '/guide/search' },
          { text: 'GitHub', link: 'https://github.com/Simon-He95/markstream-vue' },
        ],
      },
      zh: {
        selectText: '选择语言',
        label: '简体中文',
        ariaLabel: '选择语言',
        nav: [
          { text: '快速开始', link: '/zh/guide/quick-start' },
          { text: '示例', link: '/zh/guide/examples' },
          { text: 'API', link: '/zh/guide/components' },
          { text: '演示', link: 'https://markstream-vue.simonhe.me/' },
          { text: '搜索', link: '/zh/guide/search' },
          { text: 'GitHub', link: 'https://github.com/Simon-He95/markstream-vue' },
        ],
      },
    },
  },
  // Optional: use Algolia DocSearch instead of local search. To enable,
  // set `themeConfig.search.provider = 'algolia'` and add `themeConfig.search.options`.
  // Example:
  // themeConfig: {
  //   ...
  //   search: {
  //     provider: 'algolia',
  //     options: {
  //       appId: 'YOUR_APP_ID',
  //       apiKey: 'YOUR_SEARCH_ONLY_API_KEY',
  //       indexName: 'YOUR_INDEX_NAME'
  //     }
  //   }
  // }
} as any)
