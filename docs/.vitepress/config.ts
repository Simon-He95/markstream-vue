import { readdirSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { transformerTwoslash } from '@shikijs/vitepress-twoslash'
import { defineConfig } from 'vitepress'
import { componentCategories, componentsDocData } from './theme/data/components'

const docsSiteUrl = process.env.VITEPRESS_SITE_URL || 'https://markstream.simonhe.me'
const docsOgImageUrl = getDocsAbsoluteAssetUrl('/og-image.png')
const docsOgImageAlt = 'Markstream streaming Markdown renderer documentation overview'
const docsDefaultDescription = 'Streaming Markdown renderers for AI apps across Vue, React, SolidJS, Svelte, Angular, Nuxt, and Next.js'
const githubRepoUrl = 'https://github.com/Simon-He95/markstream-vue'
const docsRootDir = fileURLToPath(new URL('..', import.meta.url))
const workspaceRootDir = fileURLToPath(new URL('../..', import.meta.url))

const docsDefaultKeywords = [
  'streaming Markdown renderer',
  'AI chat Markdown renderer',
  'LLM Markdown renderer',
  'SSE Markdown renderer',
  'WebSocket Markdown renderer',
  'incomplete Markdown states',
  'Vue Markdown renderer',
  'React Markdown renderer',
  'Nuxt Markdown renderer',
  'streaming Mermaid',
  'KaTeX Markdown',
  'streaming code blocks',
]

const docsDefaultKeywordsZh = [
  '流式 Markdown 渲染器',
  'AI 聊天 Markdown 渲染器',
  'LLM Markdown 渲染',
  'SSE Markdown 渲染',
  'WebSocket Markdown 渲染',
  '未闭合 Markdown',
  'Vue Markdown 渲染器',
  'React Markdown 渲染器',
  'Nuxt Markdown 渲染器',
  'Mermaid 渐进渲染',
  'KaTeX 数学公式',
  '流式代码块',
]

// TypeScript sometimes rejects VitePress site locales on the `Config` type.
// Cast to `any` to avoid strict type errors in the docs config while keeping intellisense.
const markdownParserSrc = fileURLToPath(new URL('../../packages/markdown-parser/src/index.ts', import.meta.url))
const markdownParserSrcDir = path.dirname(markdownParserSrc)

const playgroundItems = [
  { text: 'Vue 3', link: 'https://markstream-vue.simonhe.me/' },
  { text: 'React', link: 'https://markstream-react.pages.dev/' },
  { text: 'Solid', link: 'https://markstream-solid.pages.dev/' },
  { text: 'Svelte', link: 'https://markstream-svelte.pages.dev/' },
  { text: 'Nuxt', link: 'https://markstream-nuxt.pages.dev/' },
  { text: 'Vue 2', link: 'https://markstream-vue2.pages.dev/' },
  { text: 'Angular', link: 'https://markstream-angular.pages.dev/' },
]

const rootNav = [
  {
    text: 'Learn',
    items: [
      { text: 'Vue Quick Start', link: '/guide/quick-start' },
      { text: 'Installation & Optional Peers', link: '/guide/installation' },
      { text: 'AI Chat & Streaming', link: '/guide/ai-chat-streaming' },
      { text: 'All Guides', link: '/guide/' },
    ],
  },
  {
    text: 'Components',
    items: [
      { text: 'Component Gallery', link: '/components/' },
      { text: 'Override Built-in Components', link: '/guide/component-overrides' },
      { text: 'Custom Tags & Advanced Components', link: '/guide/custom-components' },
      { text: 'Renderer & Node Components', link: '/guide/components' },
    ],
  },
  {
    text: 'Frameworks',
    items: [
      { text: 'Overview', link: '/frameworks/' },
      { text: 'Vue 3', link: '/frameworks/vue' },
      { text: 'Nuxt', link: '/frameworks/nuxt' },
      { text: 'Vue 2', link: '/frameworks/vue2' },
      { text: 'React', link: '/frameworks/react' },
      { text: 'Next.js', link: '/frameworks/next' },
      { text: 'SolidJS', link: '/frameworks/solid' },
      { text: 'Svelte', link: '/frameworks/svelte' },
      { text: 'Angular', link: '/frameworks/angular' },
    ],
  },
  { text: 'Playground', items: playgroundItems },
  { text: 'Troubleshooting', link: '/guide/troubleshooting-path' },
  { text: 'GitHub', link: 'https://github.com/Simon-He95/markstream-vue' },
]

const zhNav = [
  {
    text: '学习',
    items: [
      { text: 'Vue 快速开始', link: '/zh/guide/quick-start' },
      { text: '安装与可选依赖', link: '/zh/guide/installation' },
      { text: 'AI 聊天与流式输出', link: '/zh/guide/ai-chat-streaming' },
      { text: '全部指南', link: '/zh/guide/' },
    ],
  },
  {
    text: '组件',
    items: [
      { text: '组件画廊', link: '/zh/components/' },
      { text: '覆盖内置组件', link: '/zh/guide/component-overrides' },
      { text: '自定义标签与高级组件', link: '/zh/guide/custom-components' },
      { text: '渲染器与节点组件', link: '/zh/guide/components' },
    ],
  },
  {
    text: '框架',
    items: [
      { text: '框架总览', link: '/zh/frameworks/' },
      { text: 'Vue 3', link: '/zh/frameworks/vue' },
      { text: 'Nuxt', link: '/zh/frameworks/nuxt' },
      { text: 'Vue 2', link: '/zh/frameworks/vue2' },
      { text: 'React', link: '/zh/frameworks/react' },
      { text: 'Next.js', link: '/zh/frameworks/next' },
      { text: 'SolidJS', link: '/zh/frameworks/solid' },
      { text: 'Svelte', link: '/zh/frameworks/svelte' },
      { text: 'Angular', link: '/zh/frameworks/angular' },
    ],
  },
  { text: '演示', items: playgroundItems },
  { text: '排障', link: '/zh/guide/troubleshooting-path' },
  { text: 'GitHub', link: 'https://github.com/Simon-He95/markstream-vue' },
]

const englishComponentCategoryGroups = componentCategories.map(category => ({
  text: category.en,
  collapsed: true,
  items: componentsDocData
    .filter(entry => entry.category === category.key)
    .map(entry => ({ text: entry.name, link: `/components/${entry.slug}` })),
}))

const englishGuideSidebar = [
  {
    text: 'Get Started',
    items: [
      { text: 'Vue Quick Start', link: '/guide/quick-start' },
      { text: 'Installation & Optional Peers', link: '/guide/installation' },
      { text: 'AI Chat & Streaming', link: '/guide/ai-chat-streaming' },
      { text: 'Nuxt SSR', link: '/nuxt-ssr' },
      { text: 'All Guides', link: '/guide/' },
    ],
  },
  {
    text: 'Components',
    items: [
      { text: 'Component Gallery', link: '/components/' },
      { text: 'Override Built-in Components', link: '/guide/component-overrides' },
      { text: 'Custom Tags & Advanced Components', link: '/guide/custom-components' },
      { text: 'Renderer & Node Components', link: '/guide/components' },
      ...englishComponentCategoryGroups,
      {
        text: 'Deep Dive Guides',
        collapsed: true,
        items: [
          { text: 'Code Blocks', link: '/guide/code-blocks' },
          { text: 'Code Block Header', link: '/guide/codeblock-header' },
          { text: 'CodeBlockNode', link: '/guide/code-block-node' },
          { text: 'ImageNode', link: '/guide/image-node' },
          { text: 'Math', link: '/guide/math' },
          { text: 'Mermaid', link: '/guide/mermaid' },
          { text: 'MermaidBlockNode', link: '/guide/mermaid-block-node' },
          { text: 'MermaidBlockNode (override)', link: '/guide/mermaid-block-node-override' },
          { text: 'Mermaid export demo', link: '/guide/mermaid-export-demo' },
          { text: 'D2', link: '/guide/d2' },
          { text: 'AntV Infographic', link: '/guide/infographic' },
          { text: 'ECharts', link: '/guide/echarts' },
          { text: 'Code Block Runtime', link: '/guide/code-block-runtime' },
        ],
      },
    ],
  },
  {
    text: 'Guides by Task',
    collapsed: true,
    items: [
      { text: 'Usage: content vs nodes', link: '/guide/usage' },
      { text: 'Props & Options', link: '/guide/props' },
      { text: 'Docs Site & VitePress', link: '/guide/vitepress-docs-integration' },
      { text: 'Features Overview', link: '/guide/features' },
      { text: 'Examples', link: '/guide/examples' },
      { text: 'Showcase', link: '/guide/showcase' },
      { text: 'Playground', link: '/guide/playground' },
      { text: 'Security', link: '/guide/security' },
      { text: 'Use Cases overview', link: '/use-cases/' },
      { text: 'Vue AI Chat Markdown', link: '/use-cases/vue-ai-chat-markdown-renderer' },
      { text: 'LLM Token Streams', link: '/use-cases/llm-token-stream-markdown' },
      { text: 'AI Chat Streaming Markdown', link: '/use-cases/ai-chat-streaming' },
      { text: 'SSE & WebSocket Markdown', link: '/use-cases/sse-websocket' },
      { text: 'Incomplete Markdown', link: '/use-cases/incomplete-markdown-renderer' },
      { text: 'Streaming Code Blocks', link: '/use-cases/streaming-code-blocks' },
      { text: 'Mobile WebView', link: '/use-cases/mobile-webview' },
      { text: 'Streaming Mermaid & KaTeX', link: '/use-cases/streaming-mermaid-katex' },
      { text: 'Long AI Responses', link: '/use-cases/long-ai-responses' },
    ],
  },
  {
    text: 'Troubleshooting',
    items: [
      { text: 'Troubleshooting by Symptom', link: '/guide/troubleshooting-path' },
      { text: 'Troubleshooting', link: '/guide/troubleshooting' },
    ],
  },
  {
    text: 'Customize',
    collapsed: true,
    items: [
      { text: 'YAML Front Matter', link: '/guide/frontmatter-cookbook' },
      { text: 'Advanced Parser Hooks', link: '/guide/advanced' },
      { text: 'Parser Overview', link: '/guide/parser' },
      { text: 'Parser API', link: '/guide/parser-api' },
      { text: 'Tailwind & Styling', link: '/guide/tailwind' },
    ],
  },
  {
    text: 'Frameworks & Migration',
    collapsed: true,
    items: [
      { text: 'Frameworks overview', link: '/frameworks/' },
      { text: 'Vue 3', link: '/frameworks/vue' },
      { text: 'Vue 2', link: '/frameworks/vue2' },
      { text: 'Nuxt', link: '/frameworks/nuxt' },
      { text: 'React', link: '/frameworks/react' },
      { text: 'Next.js', link: '/frameworks/next' },
      { text: 'SolidJS', link: '/frameworks/solid' },
      { text: 'Svelte', link: '/frameworks/svelte' },
      { text: 'Angular', link: '/frameworks/angular' },
      { text: 'Nuxt SSR', link: '/nuxt-ssr' },
      { text: 'Vue 2 Quick Start', link: '/guide/vue2-quick-start' },
      { text: 'Vue 2 Installation', link: '/guide/vue2-installation' },
      { text: 'Vue 2 Components', link: '/guide/vue2-components' },
      { text: 'React Quick Start', link: '/guide/react-quick-start' },
      { text: 'React Installation', link: '/guide/react-installation' },
      { text: 'React Components', link: '/guide/react-components' },
      { text: 'Migrate from react-markdown', link: '/guide/react-markdown-migration' },
      { text: 'Migration Cookbook', link: '/guide/react-markdown-migration-cookbook' },
      { text: 'SolidJS Quick Start', link: '/guide/solid' },
      { text: 'Svelte Quick Start', link: '/guide/svelte' },
      { text: 'Angular Quick Start', link: '/guide/angular-quick-start' },
      { text: 'Angular Installation', link: '/guide/angular-installation' },
      { text: 'AI / Skills workflows', link: '/guide/ai-workflows' },
    ],
  },
  {
    text: 'Reference',
    collapsed: true,
    items: [
      { text: 'API Overview', link: '/guide/api' },
      { text: 'Search', link: '/guide/search' },
      { text: 'Performance', link: '/guide/performance' },
      { text: 'Parser Performance Baseline', link: '/guide/parser-performance-baseline' },
      { text: '1.0 Benchmark Report', link: '/guide/benchmark-1-0' },
      { text: '2.0.0 Roadmap', link: '/guide/roadmap-2-0' },
      { text: 'Migrating to 2.0', link: '/guide/migration-2-0' },
      { text: '1.0 Release Readiness', link: '/guide/release-1-0' },
      { text: 'Migrating to 1.0', link: '/guide/migration-1-0' },
      { text: 'Why use it?', link: '/guide/why' },
      { text: 'Compared', link: '/guide/compared' },
      { text: 'vs vue-stream-markdown', link: '/compare/vue-stream-markdown' },
      { text: 'vs react-markdown', link: '/compare/react-markdown' },
      { text: 'vs Streamdown', link: '/compare/streamdown' },
      { text: 'vs marked/markdown-it', link: '/compare/marked-markdown-it' },
      { text: 'Static vs streaming', link: '/compare/static-vs-streaming' },
      { text: 'Compare overview', link: '/compare/' },
      { text: 'Code Block Runtime Internals', link: '/guide/code-block-runtime-internals' },
      { text: 'Legacy builds & iOS regex compatibility', link: '/guide/legacy-builds' },
      { text: 'Contributing', link: '/guide/contributing' },
    ],
  },
]

const chineseComponentCategoryGroups = componentCategories.map(category => ({
  text: category.zh,
  collapsed: true,
  items: componentsDocData
    .filter(entry => entry.category === category.key)
    .map(entry => ({ text: entry.name, link: `/zh/components/${entry.slug}` })),
}))

const chineseGuideSidebar = [
  {
    text: '开始使用',
    items: [
      { text: 'Vue 快速开始', link: '/zh/guide/quick-start' },
      { text: '安装与可选依赖', link: '/zh/guide/installation' },
      { text: 'AI 聊天与流式输出', link: '/zh/guide/ai-chat-streaming' },
      { text: 'Nuxt SSR', link: '/zh/nuxt-ssr' },
      { text: '全部指南', link: '/zh/guide/' },
    ],
  },
  {
    text: '组件',
    items: [
      { text: '组件画廊', link: '/zh/components/' },
      { text: '覆盖内置组件', link: '/zh/guide/component-overrides' },
      { text: '自定义标签与高级组件', link: '/zh/guide/custom-components' },
      { text: '渲染器与节点组件', link: '/zh/guide/components' },
      ...chineseComponentCategoryGroups,
      {
        text: '深度指南',
        collapsed: true,
        items: [
          { text: '代码块', link: '/zh/guide/code-blocks' },
          { text: '代码块头部', link: '/zh/guide/codeblock-header' },
          { text: 'CodeBlockNode', link: '/zh/guide/code-block-node' },
          { text: 'ImageNode', link: '/zh/guide/image-node' },
          { text: 'Math', link: '/zh/guide/math' },
          { text: 'Mermaid', link: '/zh/guide/mermaid' },
          { text: 'MermaidBlockNode', link: '/zh/guide/mermaid-block-node' },
          { text: '覆盖 MermaidBlockNode', link: '/zh/guide/mermaid-block-node-override' },
          { text: 'Mermaid 导出示例', link: '/zh/guide/mermaid-export-demo' },
          { text: 'D2 图表', link: '/zh/guide/d2' },
          { text: 'AntV Infographic', link: '/zh/guide/infographic' },
          { text: 'ECharts', link: '/zh/guide/echarts' },
          { text: '代码块运行时', link: '/zh/guide/code-block-runtime' },
        ],
      },
    ],
  },
  {
    text: '按任务浏览',
    collapsed: true,
    items: [
      { text: '使用：content 与 nodes', link: '/zh/guide/usage' },
      { text: 'Props 与选项', link: '/zh/guide/props' },
      { text: '文档站与 VitePress', link: '/zh/guide/vitepress-docs-integration' },
      { text: '功能特性', link: '/zh/guide/features' },
      { text: '示例', link: '/zh/guide/examples' },
      { text: 'Showcase', link: '/zh/guide/showcase' },
      { text: 'Playground', link: '/zh/guide/playground' },
      { text: '安全', link: '/zh/guide/security' },
      { text: '使用场景总览', link: '/zh/use-cases/' },
      { text: 'Vue AI 聊天 Markdown', link: '/zh/use-cases/vue-ai-chat-markdown-renderer' },
      { text: 'LLM token 流 Markdown', link: '/zh/use-cases/llm-token-stream-markdown' },
      { text: 'AI 聊天流式 Markdown', link: '/zh/use-cases/ai-chat-streaming' },
      { text: 'SSE 与 WebSocket Markdown', link: '/zh/use-cases/sse-websocket' },
      { text: '未闭合 Markdown 渲染', link: '/zh/use-cases/incomplete-markdown-renderer' },
      { text: '流式代码块', link: '/zh/use-cases/streaming-code-blocks' },
      { text: '移动端 WebView Markdown', link: '/zh/use-cases/mobile-webview' },
      { text: '流式 Mermaid 与 KaTeX', link: '/zh/use-cases/streaming-mermaid-katex' },
      { text: '长 AI 回答渲染', link: '/zh/use-cases/long-ai-responses' },
    ],
  },
  {
    text: '故障排除',
    items: [
      { text: '按症状排查', link: '/zh/guide/troubleshooting-path' },
      { text: '故障排除', link: '/zh/guide/troubleshooting' },
    ],
  },
  {
    text: '自定义',
    collapsed: true,
    items: [
      { text: 'YAML Front Matter', link: '/zh/guide/frontmatter-cookbook' },
      { text: '高级解析', link: '/zh/guide/advanced' },
      { text: '解析器概览', link: '/zh/guide/parser' },
      { text: '解析器 API', link: '/zh/guide/parser-api' },
      { text: 'Tailwind 与样式', link: '/zh/guide/tailwind' },
    ],
  },
  {
    text: '框架与迁移',
    collapsed: true,
    items: [
      { text: '框架总览', link: '/zh/frameworks/' },
      { text: 'Vue 流式 Markdown 渲染器', link: '/zh/frameworks/vue' },
      { text: 'Vue 2 流式 Markdown 渲染器', link: '/zh/frameworks/vue2' },
      { text: 'Nuxt 流式 Markdown 渲染器', link: '/zh/frameworks/nuxt' },
      { text: 'React 流式 Markdown 渲染器', link: '/zh/frameworks/react' },
      { text: 'Next.js 流式 Markdown 渲染器', link: '/zh/frameworks/next' },
      { text: 'SolidJS 流式 Markdown 渲染器', link: '/zh/frameworks/solid' },
      { text: 'Svelte 流式 Markdown 渲染器', link: '/zh/frameworks/svelte' },
      { text: 'Angular 流式 Markdown 渲染器', link: '/zh/frameworks/angular' },
      { text: 'Nuxt SSR', link: '/zh/nuxt-ssr' },
      { text: 'Vue 2 快速开始', link: '/zh/guide/vue2-quick-start' },
      { text: 'Vue 2 安装', link: '/zh/guide/vue2-installation' },
      { text: 'Vue 2 组件', link: '/zh/guide/vue2-components' },
      { text: 'React 快速开始', link: '/zh/guide/react-quick-start' },
      { text: 'React 安装', link: '/zh/guide/react-installation' },
      { text: 'React 组件', link: '/zh/guide/react-components' },
      { text: '从 react-markdown 迁移', link: '/zh/guide/react-markdown-migration' },
      { text: '迁移 Cookbook', link: '/zh/guide/react-markdown-migration-cookbook' },
      { text: 'SolidJS 快速开始', link: '/zh/guide/solid' },
      { text: 'Svelte 快速开始', link: '/zh/guide/svelte' },
      { text: 'Angular 快速开始', link: '/zh/guide/angular-quick-start' },
      { text: 'Angular 安装', link: '/zh/guide/angular-installation' },
      { text: 'AI / Skills 工作流', link: '/zh/guide/ai-workflows' },
    ],
  },
  {
    text: '参考',
    collapsed: true,
    items: [
      { text: 'API 总览', link: '/zh/guide/api' },
      { text: '搜索', link: '/zh/guide/search' },
      { text: '性能', link: '/zh/guide/performance' },
      { text: '解析器性能基线', link: '/zh/guide/parser-performance-baseline' },
      { text: '1.0 Benchmark 报告', link: '/zh/guide/benchmark-1-0' },
      { text: '2.0.0 路线图', link: '/zh/guide/roadmap-2-0' },
      { text: '迁移到 2.0', link: '/zh/guide/migration-2-0' },
      { text: '1.0 发布就绪', link: '/zh/guide/release-1-0' },
      { text: '迁移到 1.0', link: '/zh/guide/migration-1-0' },
      { text: '为什么使用？', link: '/zh/guide/why' },
      { text: '对比', link: '/zh/guide/compared' },
      { text: 'vs react-markdown', link: '/zh/compare/react-markdown' },
      { text: 'vs Streamdown', link: '/zh/compare/streamdown' },
      { text: 'vs marked / markdown-it', link: '/zh/compare/marked-markdown-it' },
      { text: '代码块运行时内部', link: '/zh/guide/code-block-runtime-internals' },
      { text: 'Legacy 构建与 iOS 正则兼容', link: '/zh/guide/legacy-builds' },
      { text: '贡献指南', link: '/zh/guide/contributing' },
    ],
  },
]

const siteHead = [
  ['link', { rel: 'icon', href: '/app-icon.svg', type: 'image/svg+xml' }],
  ['meta', { name: 'theme-color', content: '#111827' }],
  ['meta', { property: 'og:site_name', content: 'Markstream' }],
  ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
]

const seoExcludedDocsPaths = new Set([
  '/404',
  '/LEGACY-BUILDS',
  '/e2e-testing-report',
  '/zh/e2e-testing-report',
  '/guide/docs-style',
  '/zh/guide/docs-style',
  '/guide/e2e-testing-report',
  '/zh/guide/e2e-testing-report',
  '/guide/katex-worker-performance-analysis',
  '/zh/guide/katex-worker-performance-analysis',
  '/guide/monorepo-migration',
  '/zh/guide/monorepo-migration',
  '/guide/thanks',
  '/zh/guide/thanks',
  '/guide/translation',
  '/zh/guide/translation',
  '/katex-cache-analysis',
  '/zh/katex-cache-analysis',
  '/katex-worker-performance-analysis',
  '/zh/katex-worker-performance-analysis',
  '/llms',
  '/llms.zh-CN',
  '/monorepo-migration',
  '/zh/monorepo-migration',
  '/nuxt-ssr.zh-CN',
])

function normalizeDocsSeoPath(page: string) {
  if (!page || page === '.')
    return '/'

  let normalized = page

  if (!normalized.startsWith('/'))
    normalized = `/${normalized}`

  normalized = normalized.replace(/\/index\.md$/, '/')
  normalized = normalized.replace(/\/index\.html$/, '/')
  normalized = normalized.replace(/\.md$/, '')
  normalized = normalized.replace(/\.html$/, '')
  normalized = normalized.replace(/\/index$/, '/')

  if (normalized !== '/' && normalized.endsWith('/'))
    normalized = normalized.slice(0, -1)

  return normalized || '/'
}

function createDocsSeoTitle(pageTitle?: string, path?: string) {
  if (path === '/')
    return 'Markstream: Streaming Markdown renderers for AI apps'

  if (path === '/zh')
    return pageTitle && pageTitle !== 'Markstream' ? pageTitle : 'Markstream：面向 AI 应用的流式 Markdown 渲染器'

  if (!pageTitle || pageTitle === 'Markstream')
    return 'Markstream'

  return `${pageTitle} | Markstream`
}

function isDocsSeoExcluded(path: string) {
  return seoExcludedDocsPaths.has(path) || path.endsWith('.zh-CN')
}

function getDocsPriorityKey(path: string) {
  if (path === '/zh')
    return '/'

  if (path.startsWith('/zh/'))
    return path.slice(3) || '/'

  return path
}

function collectDocsRoutePaths(rootDir: string) {
  const routePaths = new Set<string>()

  function walk(currentDir: string) {
    for (const entry of readdirSync(currentDir, { withFileTypes: true })) {
      if (entry.name === '.vitepress' || entry.name === 'node_modules')
        continue

      const absolutePath = path.join(currentDir, entry.name)
      if (entry.isDirectory()) {
        walk(absolutePath)
        continue
      }

      if (!entry.isFile() || !entry.name.endsWith('.md'))
        continue

      const relativePath = path.relative(rootDir, absolutePath).replace(/\\/g, '/')
      routePaths.add(normalizeDocsSeoPath(`/${relativePath}`))
    }
  }

  walk(rootDir)
  return routePaths
}

const availableDocsRoutePaths = collectDocsRoutePaths(docsRootDir)

const docsPrimaryLandingPaths = new Set([
  '/frameworks/vue',
  '/frameworks/vue2',
  '/frameworks',
  '/frameworks/react',
  '/frameworks/solid',
  '/frameworks/svelte',
  '/frameworks/angular',
  '/frameworks/nuxt',
  '/frameworks/next',
  '/compare',
  '/compare/react-markdown',
  '/compare/streamdown',
  '/compare/marked-markdown-it',
  '/compare/vue-stream-markdown',
  '/compare/static-vs-streaming',
  '/use-cases',
  '/use-cases/vue-ai-chat-markdown-renderer',
  '/use-cases/llm-token-stream-markdown',
  '/use-cases/ai-chat-streaming',
  '/use-cases/sse-websocket',
  '/use-cases/incomplete-markdown-renderer',
  '/use-cases/streaming-code-blocks',
  '/use-cases/mobile-webview',
  '/use-cases/streaming-mermaid-katex',
  '/use-cases/long-ai-responses',
  '/quick-start',
  '/guide',
  '/guide/installation',
  '/guide/quick-start',
  '/guide/usage',
  '/guide/vitepress-docs-integration',
  '/guide/ai-chat-streaming',
  '/guide/troubleshooting-path',
  '/guide/component-overrides',
  '/guide/custom-components',
  '/guide/api',
  '/guide/components',
  '/guide/props',
  '/guide/performance',
  '/guide/tailwind',
  '/guide/react-markdown-migration',
  '/guide/playground',
  '/nuxt-ssr',
])

const docsSecondaryLandingPaths = new Set([
  '/compare/react-markdown',
  '/compare/streamdown',
  '/compare/marked-markdown-it',
  '/compare/static-vs-streaming',
  '/guide/parser',
  '/guide/parser-api',
  '/guide/features',
  '/guide/examples',
  '/guide/react-markdown-migration-cookbook',
  '/guide/vue2-quick-start',
  '/guide/react-quick-start',
  '/guide/solid',
  '/guide/angular-quick-start',
  '/guide/troubleshooting',
])

function getDocsSitemapHints(path: string) {
  const priorityKey = getDocsPriorityKey(path)

  if (priorityKey === '/')
    return { priority: 1, changefreq: 'weekly' as const }

  if (priorityKey === '/guide')
    return { priority: 0.95, changefreq: 'weekly' as const }

  if (docsPrimaryLandingPaths.has(priorityKey))
    return { priority: 0.88, changefreq: 'weekly' as const }

  if (docsSecondaryLandingPaths.has(priorityKey))
    return { priority: 0.78, changefreq: 'monthly' as const }

  if (priorityKey.startsWith('/guide/'))
    return { priority: 0.68, changefreq: 'monthly' as const }

  return { priority: 0.6, changefreq: 'monthly' as const }
}

function getDocsAlternatePaths(path: string) {
  const englishPath = path === '/zh' ? '/' : path.startsWith('/zh/') ? path.slice(3) || '/' : path
  const chinesePath = path === '/' || path === '/zh' ? '/zh' : path.startsWith('/zh/') ? path : `/zh${path}`

  const alternates = {
    english: availableDocsRoutePaths.has(englishPath) ? englishPath : null,
    chinese: availableDocsRoutePaths.has(chinesePath) ? chinesePath : null,
  }

  return alternates
}

function createDocsBreadcrumbItems(path: string, title: string, isChinese: boolean) {
  const items = []
  const homeName = isChinese ? '首页' : 'Home'
  const guideName = isChinese ? '指南' : 'Guide'
  const homePath = isChinese ? '/zh' : '/'

  items.push({
    '@type': 'ListItem',
    'position': 1,
    'name': homeName,
    'item': `${docsSiteUrl}${homePath === '/' ? '/' : homePath}`,
  })

  if (path === homePath || (isChinese && path === '/zh') || (!isChinese && path === '/'))
    return items

  const guideRoot = isChinese ? '/zh/guide' : '/guide'
  if (path === guideRoot || path.startsWith(`${guideRoot}/`)) {
    items.push({
      '@type': 'ListItem',
      'position': 2,
      'name': guideName,
      'item': `${docsSiteUrl}${guideRoot}`,
    })

    if (path !== guideRoot) {
      items.push({
        '@type': 'ListItem',
        'position': 3,
        'name': title,
        'item': `${docsSiteUrl}${path}`,
      })
    }

    return items
  }

  items.push({
    '@type': 'ListItem',
    'position': 2,
    'name': title,
    'item': `${docsSiteUrl}${path}`,
  })

  return items
}

function frontmatterStringArray(value: unknown) {
  if (Array.isArray(value))
    return value.filter((item): item is string => typeof item === 'string' && item.length > 0)

  return typeof value === 'string' && value.length > 0 ? [value] : []
}

function getDocsPageKeywords(frontmatter: Record<string, any>, isChinese: boolean) {
  const keywords = frontmatterStringArray(frontmatter.keywords)
  return keywords.length > 0 ? keywords : isChinese ? docsDefaultKeywordsZh : docsDefaultKeywords
}

function getDocsPageDateModified(frontmatter: Record<string, any>, pageLastUpdated: unknown) {
  if (frontmatter.lastUpdated === false)
    return null

  const frontmatterDate = typeof frontmatter.lastVerified === 'string' && frontmatter.lastVerified.length > 0
    ? frontmatter.lastVerified
    : frontmatter.lastUpdated

  if (typeof frontmatterDate === 'string' && frontmatterDate.length > 0)
    return frontmatterDate

  if (frontmatterDate instanceof Date)
    return frontmatterDate.toISOString()

  if (typeof frontmatter.gitLastUpdated === 'number' && frontmatter.gitLastUpdated > 0)
    return new Date(frontmatter.gitLastUpdated).toISOString()

  if (typeof pageLastUpdated === 'number' && pageLastUpdated > 0)
    return new Date(pageLastUpdated).toISOString()

  return null
}

function getDocsAbsoluteAssetUrl(value: string) {
  if (/^https?:\/\//i.test(value))
    return value

  const base = docsSiteUrl.endsWith('/') ? docsSiteUrl : `${docsSiteUrl}/`
  return new URL(value.replace(/^\//, ''), base).toString()
}

function getDocsPageOgImage(frontmatter: Record<string, any>) {
  return typeof frontmatter.ogImage === 'string' && frontmatter.ogImage.length > 0
    ? getDocsAbsoluteAssetUrl(frontmatter.ogImage)
    : docsOgImageUrl
}

function getDocsPageOgImageAlt(frontmatter: Record<string, any>) {
  return typeof frontmatter.ogImageAlt === 'string' && frontmatter.ogImageAlt.length > 0
    ? frontmatter.ogImageAlt
    : docsOgImageAlt
}

function getDocsPageOgImageDimension(value: unknown, fallback: string) {
  const numeric = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim().length > 0
      ? Number(value)
      : Number.NaN

  return Number.isFinite(numeric) && numeric > 0
    ? String(Math.round(numeric))
    : fallback
}

function frontmatterFaqItems(value: unknown) {
  if (!Array.isArray(value))
    return []

  return value
    .map((item) => {
      if (!item || typeof item !== 'object')
        return null

      const question = (item as Record<string, unknown>).question
      const answer = (item as Record<string, unknown>).answer

      if (typeof question !== 'string' || typeof answer !== 'string' || !question || !answer)
        return null

      return { question, answer }
    })
    .filter((item): item is { question: string, answer: string } => Boolean(item))
}

function createDocsStructuredData(path: string, title: string, description: string, isChinese: boolean, frontmatter: Record<string, any>, dateModified: string | null) {
  const graph: Record<string, any>[] = []
  const homePath = isChinese ? '/zh' : '/'
  const faqItems = frontmatterFaqItems(frontmatter.faq)
  const keywords = getDocsPageKeywords(frontmatter, isChinese).join(', ')
  const lastVerified = typeof frontmatter.lastVerified === 'string' && frontmatter.lastVerified.length > 0
    ? frontmatter.lastVerified
    : null

  graph.push({
    '@type': 'WebPage',
    '@id': `${docsSiteUrl}${path === '/' ? '/' : path}#webpage`,
    'name': title,
    'headline': title,
    'url': `${docsSiteUrl}${path === '/' ? '/' : path}`,
    description,
    keywords,
    'inLanguage': isChinese ? 'zh-CN' : 'en-US',
    ...(dateModified ? { dateModified } : {}),
    'isPartOf': {
      '@id': `${docsSiteUrl}${homePath === '/' ? '/' : homePath}#website`,
    },
    'publisher': {
      '@type': 'Organization',
      'name': 'Markstream',
      'url': githubRepoUrl,
    },
  })

  if (path === homePath) {
    graph.push({
      '@type': 'WebSite',
      '@id': `${docsSiteUrl}${homePath === '/' ? '/' : homePath}#website`,
      'name': 'Markstream Docs',
      'url': `${docsSiteUrl}${homePath === '/' ? '/' : homePath}`,
      'inLanguage': isChinese ? 'zh-CN' : 'en-US',
      description,
      keywords,
      ...(dateModified ? { dateModified } : {}),
      'publisher': {
        '@type': 'Organization',
        'name': 'Markstream',
        'url': githubRepoUrl,
      },
    })
  }

  if (typeof frontmatter.softwarePackage === 'string') {
    const softwareName = typeof frontmatter.softwareName === 'string'
      ? frontmatter.softwareName
      : frontmatter.softwarePackage
    const npmPackage = typeof frontmatter.npmPackage === 'string'
      ? frontmatter.npmPackage
      : frontmatter.softwarePackage
    const programmingLanguage = frontmatterStringArray(frontmatter.softwareProgrammingLanguage)
    const runtimePlatform = frontmatterStringArray(frontmatter.softwareRuntimePlatform)

    graph.push({
      '@type': 'SoftwareSourceCode',
      'name': softwareName,
      description,
      'url': `${docsSiteUrl}${path}`,
      keywords,
      'codeRepository': githubRepoUrl,
      'license': 'https://opensource.org/licenses/MIT',
      'programmingLanguage': programmingLanguage.length > 0 ? programmingLanguage : ['TypeScript'],
      'runtimePlatform': runtimePlatform,
      ...(dateModified ? { dateModified } : {}),
      'sameAs': [`https://www.npmjs.com/package/${npmPackage}`],
    })
  }

  if (path.startsWith('/compare/') || path.startsWith('/zh/compare/')) {
    graph.push({
      '@type': 'Article',
      'headline': title,
      description,
      'url': `${docsSiteUrl}${path}`,
      keywords,
      'mainEntityOfPage': `${docsSiteUrl}${path}`,
      'articleSection': isChinese ? 'Markdown 渲染器对比' : 'Markdown renderer comparison',
      'inLanguage': isChinese ? 'zh-CN' : 'en-US',
      ...((lastVerified || dateModified) ? { dateModified: lastVerified || dateModified } : {}),
      'author': {
        '@type': 'Organization',
        'name': 'Markstream',
        'url': githubRepoUrl,
      },
      'publisher': {
        '@type': 'Organization',
        'name': 'Markstream',
        'url': githubRepoUrl,
      },
    })
  }

  if (faqItems.length > 0) {
    graph.push({
      '@type': 'FAQPage',
      'mainEntity': faqItems.map(item => ({
        '@type': 'Question',
        'name': item.question,
        'acceptedAnswer': {
          '@type': 'Answer',
          'text': item.answer,
        },
      })),
    })
  }

  const breadcrumbItems = createDocsBreadcrumbItems(path, title, isChinese)
  if (breadcrumbItems.length > 0) {
    graph.push({
      '@type': 'BreadcrumbList',
      'itemListElement': breadcrumbItems,
    })
  }

  if (graph.length === 0)
    return []

  return [[
    'script',
    { type: 'application/ld+json' },
    JSON.stringify({
      '@context': 'https://schema.org',
      '@graph': graph,
    }),
  ]] as [string, Record<string, string>, string][]
}

export default defineConfig({
  title: 'Markstream',
  description: docsDefaultDescription,
  base: process.env.VITEPRESS_BASE || '/',
  head: siteHead,
  lastUpdated: true,
  markdown: {
    languages: ['ts', 'tsx', 'js', 'jsx', 'vue'],
    codeTransformers: [
      transformerTwoslash({
        explicitTrigger: true,
        twoslashOptions: {
          compilerOptions: {
            baseUrl: workspaceRootDir,
            paths: {
              'markstream-angular': ['docs/.vitepress/twoslash/markstream-angular.d.ts'],
              'markstream-react': ['docs/.vitepress/twoslash/markstream-react.d.ts'],
              'markstream-svelte': ['docs/.vitepress/twoslash/markstream-svelte.d.ts'],
              'markstream-vue': ['docs/.vitepress/twoslash/markstream-vue.d.ts'],
              'stream-markdown-parser': ['packages/markdown-parser/src/index.ts'],
            },
          },
        },
      }),
    ],
  },
  sitemap: {
    hostname: docsSiteUrl,
    transformItems(items) {
      return items
        .map((item) => {
          const url = new URL(item.url, docsSiteUrl)
          const path = normalizeDocsSeoPath(url.pathname)
          const { priority, changefreq } = getDocsSitemapHints(path)
          url.pathname = path === '/' ? '/' : path
          const links = item.links?.map((link) => {
            const alternateUrl = new URL(link.url, docsSiteUrl)
            const alternatePath = normalizeDocsSeoPath(alternateUrl.pathname)
            alternateUrl.pathname = alternatePath === '/' ? '/' : alternatePath

            return {
              ...link,
              url: alternateUrl.toString(),
            }
          })

          return {
            ...item,
            url: url.toString(),
            links,
            priority,
            changefreq,
            fullPrecisionPriority: true,
          }
        })
        .filter(item => !isDocsSeoExcluded(normalizeDocsSeoPath(new URL(item.url, docsSiteUrl).pathname)))
    },
  },
  vite: {
    resolve: {
      // Docs import the built `markstream-vue` package, which keeps
      // `stream-markdown-parser` external. Point VitePress at the workspace
      // source so clean CI checkouts don't need a prebuilt parser dist.
      alias: [
        {
          find: /^stream-markdown-parser$/,
          replacement: markdownParserSrc,
        },
        {
          find: /^stream-markdown-parser\//,
          replacement: `${markdownParserSrcDir}/`,
        },
      ],
    },
  },
  locales: {
    root: {
      label: 'English',
      lang: 'en-US',
      title: 'Markstream',
      description: docsDefaultDescription,
      link: '/',
      themeConfig: {
        selectText: 'Languages',
        label: 'English',
        ariaLabel: 'Select language',
        nav: rootNav,
      },
    },
    zh: {
      label: '简体中文',
      lang: 'zh-CN',
      title: 'Markstream',
      description: '适用于 AI 应用的多框架流式 Markdown 渲染器家族',
      link: '/zh/',
      themeConfig: {
        selectText: '选择语言',
        label: '简体中文',
        ariaLabel: '选择语言',
        nav: zhNav,
      },
    },
  },
  themeConfig: {
    logo: {
      light: '/logo.svg',
      dark: '/logo-dark.svg',
      alt: 'Markstream',
    },
    search: {
      provider: 'local',
      options: {
        locales: {
          zh: {
            translations: {
              button: {
                buttonText: '搜索文档',
                buttonAriaLabel: '搜索文档',
              },
              modal: {
                noResultsText: '未找到相关结果',
                resetButtonTitle: '清除查询条件',
                footer: {
                  selectText: '选择',
                  navigateText: '切换',
                  closeText: '关闭',
                },
              },
            },
          },
        },
      },
    },
    nav: rootNav,
    sidebar: {
      '/guide/': englishGuideSidebar,
      '/components/': englishGuideSidebar,
      '/zh/guide/': chineseGuideSidebar,
      '/zh/components/': chineseGuideSidebar,
      '/zh/': chineseGuideSidebar,
      '/': englishGuideSidebar,
    },
  },
  transformPageData(pageData) {
    if (typeof pageData.lastUpdated !== 'number' || pageData.lastUpdated <= 0)
      return

    return {
      frontmatter: {
        ...pageData.frontmatter,
        gitLastUpdated: pageData.lastUpdated,
      },
    }
  },
  transformHead(ctx) {
    const normalizedPath = normalizeDocsSeoPath(ctx.page)
    const canonicalUrl = `${docsSiteUrl}${normalizedPath}`
    const frontmatter = ctx.pageData.frontmatter ?? {}
    const isChinese = normalizedPath === '/zh' || normalizedPath.startsWith('/zh/')
    const description = frontmatter.description || ctx.description || docsDefaultDescription
    const pageTitle = frontmatter.title || ctx.pageData.title || ctx.title || 'Markstream'
    const seoTitle = createDocsSeoTitle(pageTitle, normalizedPath)
    const structuredDataTitle = normalizedPath === '/' || normalizedPath === '/zh' ? seoTitle : pageTitle
    const dateModified = getDocsPageDateModified(frontmatter, ctx.pageData.lastUpdated)
    const shouldIndex = !ctx.pageData.isNotFound && !frontmatter.noindex && !isDocsSeoExcluded(normalizedPath)
    const isArticle = normalizedPath.startsWith('/compare/') || normalizedPath.startsWith('/zh/compare/')
    const ogImageUrl = getDocsPageOgImage(frontmatter)
    const ogImageAlt = getDocsPageOgImageAlt(frontmatter)
    const ogImageWidth = getDocsPageOgImageDimension(frontmatter.ogImageWidth, '1200')
    const ogImageHeight = getDocsPageOgImageDimension(frontmatter.ogImageHeight, '630')
    const alternates = getDocsAlternatePaths(normalizedPath)
    const alternateHead = []
    const alternateLocales = []

    if (alternates.english) {
      alternateHead.push(['link', { rel: 'alternate', hreflang: 'en-US', href: `${docsSiteUrl}${alternates.english}` }])
      alternateLocales.push('en_US')
    }

    if (alternates.chinese) {
      alternateHead.push(['link', { rel: 'alternate', hreflang: 'zh-CN', href: `${docsSiteUrl}${alternates.chinese}` }])
      alternateLocales.push('zh_CN')
    }

    const defaultAlternate = alternates.english || alternates.chinese
    if (defaultAlternate)
      alternateHead.push(['link', { rel: 'alternate', hreflang: 'x-default', href: `${docsSiteUrl}${defaultAlternate}` }])

    const structuredData = shouldIndex
      ? createDocsStructuredData(
          normalizedPath,
          structuredDataTitle,
          description,
          isChinese,
          frontmatter,
          dateModified,
        )
      : []

    return [
      ['link', { rel: 'canonical', href: canonicalUrl }],
      ...alternateHead,
      ['meta', { name: 'description', content: description }],
      ['meta', { name: 'robots', content: shouldIndex ? 'index,follow' : 'noindex,nofollow' }],
      ['meta', { property: 'og:type', content: isArticle ? 'article' : 'website' }],
      ['meta', { property: 'og:locale', content: isChinese ? 'zh_CN' : 'en_US' }],
      ...alternateLocales
        .filter(locale => locale !== (isChinese ? 'zh_CN' : 'en_US'))
        .map(locale => ['meta', { property: 'og:locale:alternate', content: locale }]),
      ['meta', { property: 'og:title', content: seoTitle }],
      ['meta', { property: 'og:description', content: description }],
      ['meta', { property: 'og:url', content: canonicalUrl }],
      ['meta', { property: 'og:image', content: ogImageUrl }],
      ['meta', { property: 'og:image:alt', content: ogImageAlt }],
      ['meta', { property: 'og:image:width', content: ogImageWidth }],
      ['meta', { property: 'og:image:height', content: ogImageHeight }],
      ...(dateModified
        ? [
            ['meta', { property: 'og:updated_time', content: dateModified }],
            ...(isArticle ? [['meta', { property: 'article:modified_time', content: dateModified }]] : []),
          ]
        : []),
      ['meta', { name: 'twitter:title', content: seoTitle }],
      ['meta', { name: 'twitter:description', content: description }],
      ['meta', { name: 'twitter:image', content: ogImageUrl }],
      ['meta', { name: 'twitter:image:alt', content: ogImageAlt }],
      ...structuredData,
    ]
  },
} as any)
