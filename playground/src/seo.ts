import type { RouteLocationNormalizedLoaded, Router } from 'vue-router'

const PLAYGROUND_SITE_URL = 'https://markstream-vue.simonhe.me'
const PLAYGROUND_OG_IMAGE_URL = `${PLAYGROUND_SITE_URL}/og-image.svg`
const GITHUB_REPO_URL = 'https://github.com/Simon-He95/markstream-vue'
const DEFAULT_TITLE = 'markstream-vue Playground | Streaming Markdown, Mermaid, and large-document demos'
const DEFAULT_DESCRIPTION = 'Explore markstream-vue with live playground demos for streaming Markdown, Mermaid, KaTeX, CDN peers, and large-document rendering.'
const DEFAULT_ROBOTS = 'noindex,nofollow'

interface RouteSeoConfig {
  title: string
  description: string
  robots?: string
}

const routeSeoMap: Record<string, RouteSeoConfig> = {
  '/': {
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    robots: 'index,follow',
  },
  '/markdown': {
    title: 'Markdown Block Playground | markstream-vue',
    description: 'Focus on MarkdownCodeBlockNode behavior with streaming content, KaTeX, Mermaid, custom tags, and code block theming.',
    robots: 'index,follow',
  },
  '/test': {
    title: 'Markdown Preview & Test Lab | markstream-vue Playground',
    description: 'Paste markdown for live preview, then compare framework and version behavior with streaming, Monaco, Mermaid, and KaTeX in one place.',
    robots: 'index,follow',
  },
  '/cdn-peers': {
    title: 'CDN Peer Loading Demo | markstream-vue Playground',
    description: 'See how to run markstream-vue with KaTeX and Mermaid loaded from CDNs, including worker setup and runtime fallback handling.',
    robots: 'index,follow',
  },
  '/mermaid-export-demo': {
    title: 'Mermaid Export Override Demo | markstream-vue Playground',
    description: 'Learn how to intercept Mermaid export events, replace the built-in renderer, and upload generated SVG output.',
    robots: 'index,follow',
  },
  '/diff-theme-regression': {
    title: 'Diff Theme Regression Check | markstream-vue Playground',
    description: 'Internal regression page for validating diff theme rendering.',
    robots: 'noindex,nofollow',
  },
  '/diff-line-info-regression': {
    title: 'Diff Line-Info Regression Check | markstream-vue Playground',
    description: 'Internal regression page for validating diff metadata rendering.',
    robots: 'noindex,nofollow',
  },
  '/test-sandbox': {
    title: 'Sandbox Runtime Check | markstream-vue Playground',
    description: 'Internal sandbox for version and framework compatibility checks.',
    robots: 'noindex,nofollow',
  },
}

function normalizeRoutePath(path: string) {
  if (!path)
    return '/'

  const normalized = path.replace(/\/+$/, '')
  return normalized || '/'
}

function getRouteSeo(path: string) {
  const normalized = normalizeRoutePath(path)
  return routeSeoMap[normalized] ?? {
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    robots: DEFAULT_ROBOTS,
  }
}

function upsertMeta(selector: string, attributes: Record<string, string>) {
  let element = document.head.querySelector<HTMLMetaElement>(selector)
  if (!element) {
    element = document.createElement('meta')
    document.head.appendChild(element)
  }

  Object.entries(attributes).forEach(([key, value]) => {
    element!.setAttribute(key, value)
  })
}

function upsertLink(selector: string, attributes: Record<string, string>) {
  let element = document.head.querySelector<HTMLLinkElement>(selector)
  if (!element) {
    element = document.createElement('link')
    document.head.appendChild(element)
  }

  Object.entries(attributes).forEach(([key, value]) => {
    element!.setAttribute(key, value)
  })
}

function upsertJsonLd(selector: string, payload: string) {
  let element = document.head.querySelector<HTMLScriptElement>(selector)
  if (!element) {
    element = document.createElement('script')
    element.type = 'application/ld+json'
    element.dataset.seoJsonld = 'playground'
    document.head.appendChild(element)
  }

  element.textContent = payload
}

function removeJsonLd(selector: string) {
  document.head.querySelector(selector)?.remove()
}

function createStructuredData(path: string, canonicalUrl: string, seo: RouteSeoConfig) {
  const pageName = seo.title.replace(/\s+\|\s+markstream-vue.*$/, '')
  const graph: Record<string, any>[] = [
    {
      '@type': 'WebSite',
      '@id': `${PLAYGROUND_SITE_URL}/#website`,
      'name': 'markstream-vue Playground',
      'url': `${PLAYGROUND_SITE_URL}/`,
      'description': DEFAULT_DESCRIPTION,
      'publisher': {
        '@type': 'Organization',
        'name': 'markstream-vue',
        'url': GITHUB_REPO_URL,
      },
    },
    {
      '@type': 'BreadcrumbList',
      'itemListElement': [
        {
          '@type': 'ListItem',
          'position': 1,
          'name': 'Playground',
          'item': `${PLAYGROUND_SITE_URL}/`,
        },
        ...(path === '/'
          ? []
          : [{
              '@type': 'ListItem',
              'position': 2,
              'name': pageName,
              'item': canonicalUrl,
            }]),
      ],
    },
    {
      '@type': 'SoftwareApplication',
      'name': pageName,
      'applicationCategory': 'DeveloperApplication',
      'operatingSystem': 'Web',
      'url': canonicalUrl,
      'description': seo.description,
      'image': PLAYGROUND_OG_IMAGE_URL,
      'isAccessibleForFree': true,
      'offers': {
        '@type': 'Offer',
        'price': '0',
        'priceCurrency': 'USD',
      },
      'sameAs': [
        GITHUB_REPO_URL,
        `${PLAYGROUND_SITE_URL}/`,
      ],
      'isPartOf': {
        '@id': `${PLAYGROUND_SITE_URL}/#website`,
      },
    },
  ]

  return JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': graph,
  })
}

function applyRouteSeo(route: RouteLocationNormalizedLoaded) {
  const path = normalizeRoutePath(route.path)
  const seo = getRouteSeo(path)
  const canonicalUrl = path === '/' ? `${PLAYGROUND_SITE_URL}/` : `${PLAYGROUND_SITE_URL}${path}`

  document.title = seo.title

  upsertLink('link[rel="canonical"]', { rel: 'canonical', href: canonicalUrl })
  upsertMeta('meta[name="description"]', { name: 'description', content: seo.description })
  upsertMeta('meta[name="robots"]', { name: 'robots', content: seo.robots || DEFAULT_ROBOTS })
  upsertMeta('meta[property="og:type"]', { property: 'og:type', content: 'website' })
  upsertMeta('meta[property="og:site_name"]', { property: 'og:site_name', content: 'markstream-vue Playground' })
  upsertMeta('meta[property="og:title"]', { property: 'og:title', content: seo.title })
  upsertMeta('meta[property="og:description"]', { property: 'og:description', content: seo.description })
  upsertMeta('meta[property="og:url"]', { property: 'og:url', content: canonicalUrl })
  upsertMeta('meta[property="og:image"]', { property: 'og:image', content: PLAYGROUND_OG_IMAGE_URL })
  upsertMeta('meta[property="og:image:alt"]', { property: 'og:image:alt', content: 'markstream-vue logo and playground demos' })
  upsertMeta('meta[name="twitter:card"]', { name: 'twitter:card', content: 'summary_large_image' })
  upsertMeta('meta[name="twitter:title"]', { name: 'twitter:title', content: seo.title })
  upsertMeta('meta[name="twitter:description"]', { name: 'twitter:description', content: seo.description })
  upsertMeta('meta[name="twitter:image"]', { name: 'twitter:image', content: PLAYGROUND_OG_IMAGE_URL })

  if ((seo.robots || DEFAULT_ROBOTS).startsWith('noindex')) {
    removeJsonLd('script[data-seo-jsonld="playground"]')
    return
  }

  upsertJsonLd('script[data-seo-jsonld="playground"]', createStructuredData(path, canonicalUrl, seo))
}

export function installPlaygroundSeo(router: Router) {
  router.afterEach((to) => {
    applyRouteSeo(to)
  })

  void router.isReady().then(() => {
    applyRouteSeo(router.currentRoute.value)
  })
}
