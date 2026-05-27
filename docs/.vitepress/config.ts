import { readdirSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { transformerTwoslash } from '@shikijs/vitepress-twoslash'
import { defineConfig } from 'vitepress'

const docsSiteUrl = 'https://markstream-vue-docs.simonhe.me'
const docsOgImageUrl = `${docsSiteUrl}/og-image.svg`
const docsDefaultDescription = 'Streaming-friendly Markdown renderer for Vue 3, Vue 2, React, Angular, and Svelte'
const githubRepoUrl = 'https://github.com/Simon-He95/markstream-vue'
const docsRootDir = fileURLToPath(new URL('..', import.meta.url))
const workspaceRootDir = fileURLToPath(new URL('../..', import.meta.url))

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
  { text: 'Get started', link: '/guide/installation' },
  { text: 'Customization', link: '/guide/component-overrides' },
  { text: 'Migration / AI', link: '/guide/ai-workflows' },
  { text: 'API Reference', link: '/guide/api' },
  { text: 'Playground', items: playgroundItems },
  { text: 'GitHub', link: 'https://github.com/Simon-He95/markstream-vue' },
]

const zhNav = [
  { text: '快速开始', link: '/zh/guide/installation' },
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
      { text: 'Installation', link: '/guide/installation' },
      { text: 'Quick Start', link: '/guide/quick-start' },
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
    text: 'Frameworks & Migration',
    collapsed: true,
    items: [
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
      { text: '安装', link: '/zh/guide/installation' },
      { text: '快速开始', link: '/zh/guide/quick-start' },
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
  ['meta', { name: 'robots', content: 'index,follow' }],
  ['meta', { property: 'og:type', content: 'website' }],
  ['meta', { property: 'og:site_name', content: 'markstream-vue' }],
  ['meta', { property: 'og:image', content: docsOgImageUrl }],
  ['meta', { property: 'og:image:alt', content: 'markstream-vue logo and documentation overview' }],
  ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
  ['meta', { name: 'twitter:image', content: docsOgImageUrl }],
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

function createDocsSeoTitle(pageTitle?: string) {
  if (!pageTitle || pageTitle === 'markstream-vue')
    return 'markstream-vue'

  return `${pageTitle} | markstream-vue`
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
  const chinesePath = path === '/' ? '/zh' : path.startsWith('/zh/') ? path : `/zh${path}`

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

function createDocsStructuredData(path: string, title: string, description: string, isChinese: boolean) {
  const graph: Record<string, any>[] = []
  const homePath = isChinese ? '/zh' : '/'

  if (path === homePath) {
    graph.push({
      '@type': 'WebSite',
      '@id': `${docsSiteUrl}${homePath === '/' ? '/' : homePath}#website`,
      'name': 'markstream-vue Docs',
      'url': `${docsSiteUrl}${homePath === '/' ? '/' : homePath}`,
      'inLanguage': isChinese ? 'zh-CN' : 'en-US',
      description,
      'publisher': {
        '@type': 'Organization',
        'name': 'markstream-vue',
        'url': githubRepoUrl,
      },
    })

    graph.push({
      '@type': 'SoftwareApplication',
      'name': 'markstream-vue',
      'applicationCategory': 'DeveloperApplication',
      'operatingSystem': 'Web',
      'url': `${docsSiteUrl}${homePath === '/' ? '/' : homePath}`,
      description,
      'offers': {
        '@type': 'Offer',
        'price': '0',
        'priceCurrency': 'USD',
      },
      'sameAs': [
        githubRepoUrl,
        docsSiteUrl,
        'https://markstream-vue.simonhe.me/',
      ],
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
  title: 'markstream-vue',
  description: docsDefaultDescription,
  base: process.env.VITEPRESS_BASE || '/',
  head: siteHead,
  markdown: {
    languages: ['ts', 'tsx', 'js', 'jsx', 'vue'],
    codeTransformers: [
      transformerTwoslash({
        explicitTrigger: true,
        twoslashOptions: {
          compilerOptions: {
            baseUrl: workspaceRootDir,
            paths: {
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
      title: 'markstream-vue',
      description: docsDefaultDescription,
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
    logo: {
      light: '/logo.svg',
      dark: '/logo-dark.svg',
      alt: 'markstream-vue',
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
    locales: {
      root: {
        selectText: 'Languages',
        label: 'English',
        ariaLabel: 'Select language',
        nav: rootNav,
      },
      zh: {
        selectText: '选择语言',
        label: '简体中文',
        ariaLabel: '选择语言',
        nav: zhNav,
      },
    },
  },
  transformHead(ctx) {
    const normalizedPath = normalizeDocsSeoPath(ctx.page)
    const canonicalUrl = `${docsSiteUrl}${normalizedPath}`
    const frontmatter = ctx.pageData.frontmatter ?? {}
    const isChinese = normalizedPath === '/zh' || normalizedPath.startsWith('/zh/')
    const description = frontmatter.description || ctx.description || docsDefaultDescription
    const title = createDocsSeoTitle(frontmatter.title || ctx.pageData.title || ctx.title)
    const shouldIndex = !ctx.pageData.isNotFound && !frontmatter.noindex && !isDocsSeoExcluded(normalizedPath)
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
          frontmatter.title || ctx.pageData.title || ctx.title || 'markstream-vue',
          description,
          isChinese,
        )
      : []

    return [
      ['link', { rel: 'canonical', href: canonicalUrl }],
      ...alternateHead,
      ['meta', { name: 'description', content: description }],
      ['meta', { name: 'robots', content: shouldIndex ? 'index,follow' : 'noindex,nofollow' }],
      ['meta', { property: 'og:locale', content: isChinese ? 'zh_CN' : 'en_US' }],
      ...alternateLocales
        .filter(locale => locale !== (isChinese ? 'zh_CN' : 'en_US'))
        .map(locale => ['meta', { property: 'og:locale:alternate', content: locale }]),
      ['meta', { property: 'og:title', content: title }],
      ['meta', { property: 'og:description', content: description }],
      ['meta', { property: 'og:url', content: canonicalUrl }],
      ['meta', { name: 'twitter:title', content: title }],
      ['meta', { name: 'twitter:description', content: description }],
      ...structuredData,
    ]
  },
} as any)
