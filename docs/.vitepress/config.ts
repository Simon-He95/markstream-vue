import { readdirSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { transformerTwoslash } from '@shikijs/vitepress-twoslash'
import { defineConfig } from 'vitepress'

const docsSiteUrl = process.env.VITEPRESS_SITE_URL || 'https://markstream.simonhe.me'
const docsOgImageUrl = getDocsAbsoluteAssetUrl('/og-image.svg')
const docsOgImageAlt = 'Markstream streaming Markdown renderer documentation overview'
const docsDefaultDescription = 'Streaming Markdown renderers for AI apps across Vue, React, Svelte, Angular, Nuxt, and Next.js'
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
  { text: 'Svelte', link: 'https://markstream-svelte.pages.dev/' },
  { text: 'Nuxt', link: 'https://markstream-nuxt.pages.dev/' },
  { text: 'Vue 2', link: 'https://markstream-vue2.pages.dev/' },
  { text: 'Angular', link: 'https://markstream-angular.pages.dev/' },
]

const rootNav = [
  { text: 'Frameworks', link: '/frameworks/' },
  { text: 'Get started', link: '/guide/' },
  { text: 'Customization', link: '/guide/component-overrides' },
  { text: 'Migration / AI', link: '/guide/ai-workflows' },
  { text: 'API Reference', link: '/guide/api' },
  { text: 'Playground', items: playgroundItems },
  { text: 'GitHub', link: 'https://github.com/Simon-He95/markstream-vue' },
]

const zhNav = [
  { text: '框架选择', link: '/zh/frameworks/' },
  { text: '快速开始', link: '/zh/quick-start' },
  { text: '自定义', link: '/zh/guide/component-overrides' },
  { text: '接入与迁移', link: '/zh/guide/ai-workflows' },
  { text: 'API 参考', link: '/zh/guide/api' },
  { text: '演示', items: playgroundItems },
  { text: '搜索', link: '/zh/guide/search' },
  { text: 'GitHub', link: 'https://github.com/Simon-He95/markstream-vue' },
]

const englishGuideSidebar = [
  {
    text: 'Start Here',
    items: [
      { text: 'Guide Home', link: '/guide/' },
      { text: 'Multi-framework Quick Start', link: '/quick-start' },
      { text: 'Vue / Nuxt Installation', link: '/guide/installation' },
      { text: 'Vue Quick Start', link: '/guide/quick-start' },
      { text: 'Usage & Streaming', link: '/guide/usage' },
      { text: 'Docs Site & VitePress', link: '/guide/vitepress-docs-integration' },
      { text: 'AI Chat & Streaming', link: '/guide/ai-chat-streaming' },
      { text: 'Security', link: '/guide/security' },
      { text: 'Troubleshooting by Symptom', link: '/guide/troubleshooting-path' },
      { text: 'Props & Options', link: '/guide/props' },
      { text: 'Features Overview', link: '/guide/features' },
      { text: 'Examples', link: '/guide/examples' },
      { text: 'Showcase', link: '/guide/showcase' },
      { text: 'Playground', link: '/guide/playground' },
    ],
  },
  {
    text: 'Customization',
    items: [
      { text: 'Renderer & Node Components', link: '/guide/components' },
      { text: 'Override Built-in Components', link: '/guide/component-overrides' },
      { text: 'Custom Tags & Advanced Components', link: '/guide/custom-components' },
      { text: 'YAML Front Matter', link: '/guide/frontmatter-cookbook' },
      { text: 'Advanced Parser Hooks', link: '/guide/advanced' },
      { text: 'Parser Overview', link: '/guide/parser' },
      { text: 'Parser API', link: '/guide/parser-api' },
      { text: 'Tailwind & Styling', link: '/guide/tailwind' },
      { text: 'Troubleshooting', link: '/guide/troubleshooting' },
    ],
  },
  {
    text: 'Feature Guides',
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
      { text: 'Monaco', link: '/guide/monaco' },
    ],
  },
  {
    text: 'Use Cases',
    collapsed: true,
    items: [
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
    text: 'Frameworks & Migration',
    collapsed: true,
    items: [
      { text: 'Frameworks overview', link: '/frameworks/' },
      { text: 'Vue (SEO landing)', link: '/frameworks/vue' },
      { text: 'Vue 2 (SEO landing)', link: '/frameworks/vue2' },
      { text: 'Nuxt (SEO landing)', link: '/frameworks/nuxt' },
      { text: 'React (SEO landing)', link: '/frameworks/react' },
      { text: 'Next.js (SEO landing)', link: '/frameworks/next' },
      { text: 'Svelte (SEO landing)', link: '/frameworks/svelte' },
      { text: 'Angular (SEO landing)', link: '/frameworks/angular' },
      { text: 'Nuxt SSR', link: '/nuxt-ssr' },
      { text: 'Vue 2 Quick Start', link: '/guide/vue2-quick-start' },
      { text: 'Vue 2 Installation', link: '/guide/vue2-installation' },
      { text: 'Vue 2 Components', link: '/guide/vue2-components' },
      { text: 'React Quick Start', link: '/guide/react-quick-start' },
      { text: 'React Installation', link: '/guide/react-installation' },
      { text: 'React Components', link: '/guide/react-components' },
      { text: 'Migrate from react-markdown', link: '/guide/react-markdown-migration' },
      { text: 'Migration Cookbook', link: '/guide/react-markdown-migration-cookbook' },
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
      { text: 'Performance', link: '/guide/performance' },
      { text: '1.0 Benchmark Report', link: '/guide/benchmark-1-0' },
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
      { text: 'Monaco Internals', link: '/guide/monaco-internals' },
      { text: 'Legacy builds & iOS regex compatibility', link: '/guide/legacy-builds' },
      { text: 'Contributing', link: '/guide/contributing' },
    ],
  },
]

const chineseGuideSidebar = [
  {
    text: '开始使用',
    items: [
      { text: '指南首页', link: '/zh/guide/' },
      { text: '多框架快速开始', link: '/zh/quick-start' },
      { text: '安装', link: '/zh/guide/installation' },
      { text: 'Vue 快速开始', link: '/zh/guide/quick-start' },
      { text: '使用与流式渲染', link: '/zh/guide/usage' },
      { text: '文档站与 VitePress 集成', link: '/zh/guide/vitepress-docs-integration' },
      { text: 'AI 聊天与流式输出', link: '/zh/guide/ai-chat-streaming' },
      { text: '安全', link: '/zh/guide/security' },
      { text: '按症状排查', link: '/zh/guide/troubleshooting-path' },
      { text: 'Props 与选项', link: '/zh/guide/props' },
      { text: '功能特性', link: '/zh/guide/features' },
      { text: '示例', link: '/zh/guide/examples' },
      { text: 'Showcase', link: '/zh/guide/showcase' },
      { text: 'Playground', link: '/zh/guide/playground' },
    ],
  },
  {
    text: '自定义',
    items: [
      { text: '渲染器与节点组件', link: '/zh/guide/components' },
      { text: '覆盖内置组件', link: '/zh/guide/component-overrides' },
      { text: '自定义标签与高级组件', link: '/zh/guide/custom-components' },
      { text: 'YAML Front Matter', link: '/zh/guide/frontmatter-cookbook' },
      { text: '高级解析', link: '/zh/guide/advanced' },
      { text: '解析器概览', link: '/zh/guide/parser' },
      { text: '解析器 API', link: '/zh/guide/parser-api' },
      { text: 'Tailwind 与样式', link: '/zh/guide/tailwind' },
      { text: '故障排除', link: '/zh/guide/troubleshooting' },
    ],
  },
  {
    text: '功能专题',
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
      { text: 'Monaco', link: '/zh/guide/monaco' },
    ],
  },
  {
    text: '中文 SEO 入口',
    collapsed: true,
    items: [
      { text: '框架总览', link: '/zh/frameworks/' },
      { text: 'Vue 流式 Markdown 渲染器', link: '/zh/frameworks/vue' },
      { text: 'Vue 2 流式 Markdown 渲染器', link: '/zh/frameworks/vue2' },
      { text: 'Nuxt 流式 Markdown 渲染器', link: '/zh/frameworks/nuxt' },
      { text: 'React 流式 Markdown 渲染器', link: '/zh/frameworks/react' },
      { text: 'Next.js 流式 Markdown 渲染器', link: '/zh/frameworks/next' },
      { text: 'Svelte 流式 Markdown 渲染器', link: '/zh/frameworks/svelte' },
      { text: 'Angular 流式 Markdown 渲染器', link: '/zh/frameworks/angular' },
      { text: 'AI 聊天流式 Markdown', link: '/zh/use-cases/ai-chat-streaming' },
      { text: 'SSE 与 WebSocket Markdown', link: '/zh/use-cases/sse-websocket' },
      { text: '移动端 WebView Markdown', link: '/zh/use-cases/mobile-webview' },
      { text: 'react-markdown 对比', link: '/zh/compare/react-markdown' },
      { text: 'Streamdown 对比', link: '/zh/compare/streamdown' },
      { text: 'marked / markdown-it 对比', link: '/zh/compare/marked-markdown-it' },
    ],
  },
  {
    text: '框架与迁移',
    collapsed: true,
    items: [
      { text: 'Nuxt SSR', link: '/zh/nuxt-ssr' },
      { text: 'Vue 2 快速开始', link: '/zh/guide/vue2-quick-start' },
      { text: 'Vue 2 安装', link: '/zh/guide/vue2-installation' },
      { text: 'Vue 2 组件', link: '/zh/guide/vue2-components' },
      { text: 'React 快速开始', link: '/zh/guide/react-quick-start' },
      { text: 'React 安装', link: '/zh/guide/react-installation' },
      { text: 'React 组件', link: '/zh/guide/react-components' },
      { text: '从 react-markdown 迁移', link: '/zh/guide/react-markdown-migration' },
      { text: '迁移 Cookbook', link: '/zh/guide/react-markdown-migration-cookbook' },
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
      { text: '1.0 Benchmark 报告', link: '/zh/guide/benchmark-1-0' },
      { text: '1.0 发布就绪', link: '/zh/guide/release-1-0' },
      { text: '迁移到 1.0', link: '/zh/guide/migration-1-0' },
      { text: '为什么使用？', link: '/zh/guide/why' },
      { text: '对比', link: '/zh/guide/compared' },
      { text: 'Monaco 内部', link: '/zh/guide/monaco-internals' },
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
    },
    nav: rootNav,
    sidebar: {
      '/guide/': englishGuideSidebar,
      '/zh/guide/': chineseGuideSidebar,
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
