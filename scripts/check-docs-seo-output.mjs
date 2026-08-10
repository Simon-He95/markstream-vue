import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { basename, extname, relative, resolve } from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

const root = process.cwd()
const docsDir = resolve(root, 'docs')
const publicDir = resolve(docsDir, 'public')
const distDir = resolve(docsDir, '.vitepress/dist')
const newHost = 'https://markstream.simonhe.me'
const oldHost = 'https://markstream-vue-docs.simonhe.me'
const oldHostRedirect = `${oldHost}/*  ${newHost}/:splat  301`
const docsOgImageUrl = docsAssetUrl('/og-image.png')
const docsOgImageAlt = 'Markstream streaming Markdown renderer documentation overview'
const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href

const scannedExtensions = new Set(['.html', '.xml', '.txt'])
const compareLastVerifiedMaxAgeDays = 120
const strictSeoFreshness = process.env.MARKSTREAM_STRICT_SEO_FRESHNESS === '1'
const primaryLandingPaths = [
  '/',
  '/frameworks',
  '/frameworks/vue',
  '/frameworks/vue2',
  '/frameworks/nuxt',
  '/frameworks/react',
  '/frameworks/next',
  '/frameworks/svelte',
  '/frameworks/angular',
  '/compare',
  '/compare/react-markdown',
  '/compare/streamdown',
  '/compare/marked-markdown-it',
  '/compare/vue-stream-markdown',
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
  '/zh',
  '/zh/frameworks',
  '/zh/frameworks/vue',
  '/zh/frameworks/vue2',
  '/zh/frameworks/nuxt',
  '/zh/frameworks/react',
  '/zh/frameworks/next',
  '/zh/frameworks/svelte',
  '/zh/frameworks/angular',
  '/zh/compare/react-markdown',
  '/zh/compare/streamdown',
  '/zh/compare/marked-markdown-it',
  '/zh/use-cases/ai-chat-streaming',
  '/zh/use-cases/sse-websocket',
  '/zh/use-cases/mobile-webview',
]

const failures = []
const jsonLdNodesByRelativePath = new Map()

function walkFiles(dir, ignoredNames = new Set()) {
  if (!existsSync(dir))
    return []

  const files = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (ignoredNames.has(entry.name))
      continue

    const filePath = resolve(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...walkFiles(filePath, ignoredNames))
      continue
    }

    if (entry.isFile())
      files.push(filePath)
  }

  return files
}

function distRelative(filePath) {
  return relative(distDir, filePath).replace(/\\/g, '/')
}

function docsRelative(filePath) {
  return relative(docsDir, filePath).replace(/\\/g, '/')
}

function readDistFile(relativePath) {
  const filePath = resolve(distDir, relativePath)
  if (!existsSync(filePath)) {
    failures.push(`${relativePath} is missing from ${relative(root, distDir)}`)
    return null
  }

  return readFileSync(filePath, 'utf8')
}

function readRepoJson(relativePath) {
  return JSON.parse(readFileSync(resolve(root, relativePath), 'utf8'))
}

function markdownRoutePath(filePath) {
  let route = `/${docsRelative(filePath).replace(/\.md$/, '')}`
  route = route.replace(/\/index$/, '')
  return route || '/'
}

function htmlFileForMarkdown(filePath) {
  return docsRelative(filePath).replace(/\.md$/, '.html')
}

function htmlFileForRoute(routePath) {
  if (routePath === '/')
    return 'index.html'

  const routePart = routePath.slice(1)
  const routeIndexFile = resolve(docsDir, routePart, 'index.md')
  if (existsSync(routeIndexFile))
    return `${routePart}/index.html`

  return `${routePart}.html`
}

function markdownFileForRoute(routePath) {
  if (routePath === '/')
    return resolve(docsDir, 'index.md')

  const routePart = routePath.slice(1)
  const indexFile = resolve(docsDir, routePart, 'index.md')
  if (existsSync(indexFile))
    return indexFile

  return resolve(docsDir, `${routePart}.md`)
}

function readFrontmatter(filePath) {
  const source = readFileSync(filePath, 'utf8')
  if (!source.startsWith('---\n'))
    return ''

  const endIndex = source.indexOf('\n---', 4)
  if (endIndex === -1)
    return ''

  return source.slice(4, endIndex)
}

function hasFrontmatterKey(frontmatter, key) {
  return new RegExp(`^${key}:`, 'm').test(frontmatter)
}

function frontmatterStringValue(frontmatter, key) {
  const line = frontmatter.split('\n').find(line => line.startsWith(`${key}:`))
  if (!line)
    return null

  let value = line.slice(key.length + 1).trim()
  if (
    value
    && (value.startsWith('\'') || value.startsWith('"'))
    && value.endsWith(value[0])
  ) {
    value = value.slice(1, -1)
  }

  return value || null
}

function frontmatterScalarValue(frontmatter, key) {
  const value = frontmatterStringValue(frontmatter, key)
  if (value == null)
    return null

  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : value
}

function docsAssetUrl(value) {
  if (/^https?:\/\//i.test(value))
    return value

  const base = newHost.endsWith('/') ? newHost : `${newHost}/`
  return new URL(value.replace(/^\//, ''), base).toString()
}

function ogImageDimensionValue(value, fallback) {
  const numeric = value == null ? Number.NaN : Number(value)
  return Number.isFinite(numeric) && numeric > 0
    ? String(Math.round(numeric))
    : fallback
}

function expectLocalOgImageAsset(value, relativePath) {
  if (!value || /^https?:\/\//i.test(value))
    return

  const normalized = value.replace(/^\//, '')
  const assetPath = resolve(publicDir, normalized)
  if (!existsSync(assetPath))
    failures.push(`${relativePath} ogImage asset is missing: docs/public/${normalized}`)
}

function parseHtmlAttrs(tag) {
  const attrs = new Map()
  const attrPattern = /([:@\w-]+)=(?:"([^"]*)"|'([^']*)')/g
  let match

  while ((match = attrPattern.exec(tag))) {
    attrs.set(match[1], match[2] ?? match[3] ?? '')
  }

  return attrs
}

function getMetaContent(content, attrName, attrValue) {
  const metaPattern = /<meta\b[^>]*>/gi
  let match

  while ((match = metaPattern.exec(content))) {
    const attrs = parseHtmlAttrs(match[0])
    if (attrs.get(attrName) === attrValue)
      return attrs.get('content') ?? null
  }

  return null
}

function expectMetaContent(content, relativePath, attrName, attrValue, expectedValue = null) {
  const actual = getMetaContent(content, attrName, attrValue)
  if (!actual) {
    failures.push(`${relativePath} is missing meta ${attrName}="${attrValue}"`)
    return
  }

  if (expectedValue != null && actual !== expectedValue)
    failures.push(`${relativePath} meta ${attrName}="${attrValue}" expected ${expectedValue}, got ${actual}`)
}

function expectOgImageMeta(content, relativePath, options = {}) {
  expectMetaContent(content, relativePath, 'property', 'og:image', options.image ?? null)
  expectMetaContent(content, relativePath, 'property', 'og:image:alt', options.alt ?? null)
  expectMetaContent(content, relativePath, 'property', 'og:image:width', options.width ?? '1200')
  expectMetaContent(content, relativePath, 'property', 'og:image:height', options.height ?? '630')
  expectMetaContent(content, relativePath, 'name', 'twitter:image', options.image ?? null)
  expectMetaContent(content, relativePath, 'name', 'twitter:image:alt', options.alt ?? null)
}

function daysSinceIsoDate(value) {
  const timestamp = Date.parse(`${value}T00:00:00Z`)
  if (!Number.isFinite(timestamp))
    return null

  return Math.floor((Date.now() - timestamp) / 86_400_000)
}

function decodeHtmlEntities(value) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&#x22;/gi, '"')
    .replace(/&#39;/g, '\'')
    .replace(/&#x27;/gi, '\'')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

function structuredDataTypes(node) {
  const type = node?.['@type']
  if (typeof type === 'string')
    return [type]

  return Array.isArray(type) ? type.filter(item => typeof item === 'string') : []
}

function hasStructuredDataType(nodes, type) {
  return nodes.some(node => structuredDataTypes(node).includes(type))
}

function collectStructuredDataNodes(jsonLd) {
  if (Array.isArray(jsonLd))
    return jsonLd.flatMap(item => collectStructuredDataNodes(item))

  if (!jsonLd || typeof jsonLd !== 'object')
    return []

  if (Array.isArray(jsonLd['@graph']))
    return jsonLd['@graph'].filter(item => item && typeof item === 'object')

  return [jsonLd]
}

function parseStructuredDataNodes(content, relativePath) {
  const nodes = []
  const scriptPattern = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi
  let match

  while ((match = scriptPattern.exec(content))) {
    const [, attrs, body] = match
    if (!/\btype=(["'])application\/ld\+json\1/i.test(attrs))
      continue

    try {
      nodes.push(...collectStructuredDataNodes(JSON.parse(decodeHtmlEntities(body.trim()))))
    }
    catch (error) {
      failures.push(`${relativePath} has invalid JSON-LD: ${error.message}`)
    }
  }

  return nodes
}

function hasNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function hasStringArray(value) {
  return Array.isArray(value) && value.some(item => hasNonEmptyString(item))
}

export function hasOfferPrice(value) {
  const offers = Array.isArray(value) ? value : value && typeof value === 'object' ? [value] : []
  return offers.some((offer) => {
    const price = offer?.price
    if (typeof price === 'number')
      return Number.isFinite(price) && price >= 0

    if (typeof price === 'string' && price.trim().length > 0) {
      const numericPrice = Number(price)
      return Number.isFinite(numericPrice) && numericPrice >= 0
    }

    return false
  })
}

function validateSoftwareApplicationNode(node, relativePath) {
  if (!hasNonEmptyString(node.name))
    failures.push(`${relativePath} SoftwareApplication is missing name`)

  if (!hasOfferPrice(node.offers))
    failures.push(`${relativePath} SoftwareApplication is missing offers.price`)

  if (!node.aggregateRating && !node.review)
    failures.push(`${relativePath} SoftwareApplication is missing aggregateRating or review`)

  if (node.softwareVersion === 'latest')
    failures.push(`${relativePath} SoftwareApplication uses non-specific softwareVersion "latest"`)
}

function validateSoftwareSourceCodeNode(node, relativePath) {
  for (const field of ['name', 'description', 'url', 'codeRepository', 'license']) {
    if (!hasNonEmptyString(node[field]))
      failures.push(`${relativePath} SoftwareSourceCode is missing ${field}`)
  }

  if (!hasStringArray(node.programmingLanguage))
    failures.push(`${relativePath} SoftwareSourceCode is missing programmingLanguage`)

  if (!hasStringArray(node.sameAs))
    failures.push(`${relativePath} SoftwareSourceCode is missing sameAs`)
}

function validateFaqPageNode(node, relativePath) {
  if (!Array.isArray(node.mainEntity) || node.mainEntity.length === 0) {
    failures.push(`${relativePath} FAQPage is missing mainEntity`)
    return
  }

  for (const item of node.mainEntity) {
    if (!item || typeof item !== 'object' || !structuredDataTypes(item).includes('Question')) {
      failures.push(`${relativePath} FAQPage contains a non-Question mainEntity`)
      continue
    }

    if (!hasNonEmptyString(item.name))
      failures.push(`${relativePath} FAQPage Question is missing name`)

    const answer = item.acceptedAnswer
    if (!answer || typeof answer !== 'object' || !structuredDataTypes(answer).includes('Answer') || !hasNonEmptyString(answer.text))
      failures.push(`${relativePath} FAQPage Question is missing acceptedAnswer.text`)
  }
}

function validateWebPageNode(node, relativePath) {
  for (const field of ['name', 'description', 'url', 'dateModified']) {
    if (!hasNonEmptyString(node[field]))
      failures.push(`${relativePath} WebPage is missing ${field}`)
  }
}

function validateArticleNode(node, relativePath, lastVerified) {
  for (const field of ['headline', 'description', 'url', 'mainEntityOfPage']) {
    if (!hasNonEmptyString(node[field]))
      failures.push(`${relativePath} Article is missing ${field}`)
  }

  if (lastVerified && node.dateModified !== lastVerified)
    failures.push(`${relativePath} is missing Article dateModified ${lastVerified}`)
}

function validateCompareFreshness(relativePath, lastVerified) {
  if (!lastVerified) {
    failures.push(`${relativePath} compare page is missing lastVerified`)
    return
  }

  const ageDays = daysSinceIsoDate(lastVerified)
  if (ageDays === null) {
    failures.push(`${relativePath} has invalid lastVerified ${lastVerified}`)
    return
  }

  if (ageDays > compareLastVerifiedMaxAgeDays) {
    const message = `${relativePath} lastVerified ${lastVerified} is older than ${compareLastVerifiedMaxAgeDays} days`
    if (strictSeoFreshness)
      failures.push(message)
    else
      console.warn(`[docs-seo-output] warning: ${message}`)
  }
}

function validateStructuredDataNodes(relativePath, nodes) {
  for (const node of nodes) {
    if (structuredDataTypes(node).includes('WebPage'))
      validateWebPageNode(node, relativePath)

    if (structuredDataTypes(node).includes('SoftwareApplication'))
      validateSoftwareApplicationNode(node, relativePath)
  }
}

function findStructuredDataNode(nodes, type) {
  return nodes.find(node => structuredDataTypes(node).includes(type))
}

function expectContains(content, relativePath, marker, message) {
  if (!content.includes(marker))
    failures.push(`${relativePath} ${message}`)
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function expectSitemapLastmod(sitemap, routePath) {
  const loc = `${newHost}${routePath === '/' ? '/' : routePath}`
  const urlBlockPattern = new RegExp(
    `<url>[\\s\\S]*?<loc>${escapeRegExp(loc)}</loc>[\\s\\S]*?<lastmod>[^<]+</lastmod>[\\s\\S]*?</url>`,
  )

  if (!urlBlockPattern.test(sitemap))
    failures.push(`sitemap.xml is missing lastmod for ${loc}`)
}

function seoKeywordMapTargets(entry) {
  return [
    entry.target,
    ...(Array.isArray(entry.targetAlternates) ? entry.targetAlternates : []),
    entry.targetZh,
    ...(Array.isArray(entry.targetZhAlternates) ? entry.targetZhAlternates : []),
    entry.targetZhFallback,
    ...(Array.isArray(entry.targetZhFallbackAlternates) ? entry.targetZhFallbackAlternates : []),
  ].filter(Boolean)
}

if (isMain) {
  if (!existsSync(distDir)) {
    console.error(`[docs-seo-output] ${relative(root, distDir)} does not exist. Run docs:build first.`)
    process.exit(1)
  }

  for (const filePath of walkFiles(distDir)) {
    if (!scannedExtensions.has(extname(filePath)))
      continue

    const relativePath = distRelative(filePath)
    const content = readFileSync(filePath, 'utf8')

    if (content.includes(oldHost))
      failures.push(`${relativePath} still contains old docs host ${oldHost}`)

    if (extname(filePath) === '.html') {
      if (content.includes('VPLastUpdated'))
        failures.push(`${relativePath} renders the default theme Last updated footer`)

      const nodes = parseStructuredDataNodes(content, relativePath)
      jsonLdNodesByRelativePath.set(relativePath, nodes)
      validateStructuredDataNodes(relativePath, nodes)
    }
  }

  const requiredNewHostFiles = [
    'sitemap.xml',
    'robots.txt',
    ...walkFiles(publicDir)
      .map(filePath => relative(publicDir, filePath).replace(/\\/g, '/'))
      .filter(filePath => basename(filePath).startsWith('llms') && filePath.endsWith('.txt')),
  ]

  for (const relativePath of requiredNewHostFiles) {
    const content = readDistFile(relativePath)
    if (content && !content.includes(newHost))
      failures.push(`${relativePath} does not contain new docs host ${newHost}`)
  }

  const sitemap = readDistFile('sitemap.xml')
  if (sitemap) {
    if (!sitemap.includes('<lastmod>'))
      failures.push('sitemap.xml is missing lastmod entries')

    for (const routePath of primaryLandingPaths)
      expectSitemapLastmod(sitemap, routePath)

    expectContains(
      sitemap,
      'sitemap.xml',
      `${newHost}/use-cases`,
      'should include use-cases hub in sitemap',
    )
  }

  const compareIndex = readDistFile('compare/index.html')
  if (compareIndex) {
    expectContains(
      compareIndex,
      'compare/index.html',
      '/compare/vue-stream-markdown',
      'should link to vue-stream-markdown comparison page',
    )
  }

  const seoKeywordMap = readRepoJson('docs/seo-keyword-map.json')
  if (!Array.isArray(seoKeywordMap) || seoKeywordMap.length === 0) {
    failures.push('docs/seo-keyword-map.json must contain keyword mappings')
  }
  else {
    for (const [index, entry] of seoKeywordMap.entries()) {
      if (!hasNonEmptyString(entry.query))
        failures.push(`docs/seo-keyword-map.json entry ${index} is missing query`)

      if (entry.targetZh && !entry.targetZh.startsWith('/zh/'))
        failures.push(`docs/seo-keyword-map.json entry ${index} targetZh must start with /zh/ or use targetZhFallback`)

      if (entry.targetZhFallback && entry.targetZhFallback.startsWith('/zh/'))
        failures.push(`docs/seo-keyword-map.json entry ${index} targetZhFallback must point to a non-zh fallback route`)

      for (const target of seoKeywordMapTargets(entry)) {
        if (typeof target !== 'string' || !target.startsWith('/')) {
          failures.push(`docs/seo-keyword-map.json entry ${index} has invalid target ${target}`)
          continue
        }

        const relativePath = htmlFileForRoute(target)
        if (!existsSync(resolve(distDir, relativePath)))
          failures.push(`docs/seo-keyword-map.json entry ${index} target ${target} is missing built file ${relativePath}`)
      }
    }
  }

  const redirects = readDistFile('_redirects')
  if (redirects)
    expectContains(redirects, '_redirects', oldHostRedirect, `is missing old docs host redirect ${oldHostRedirect}`)

  for (const routePath of primaryLandingPaths) {
    const relativePath = htmlFileForRoute(routePath)
    const content = readDistFile(relativePath)
    if (!content)
      continue

    const canonicalUrl = `${newHost}${routePath === '/' ? '/' : routePath}`
    expectContains(content, relativePath, `<link rel="canonical" href="${canonicalUrl}">`, `is missing canonical ${canonicalUrl}`)
    expectContains(content, relativePath, `<meta property="og:url" content="${canonicalUrl}">`, `is missing og:url ${canonicalUrl}`)
    const frontmatter = readFrontmatter(markdownFileForRoute(routePath))
    const ogImage = frontmatterStringValue(frontmatter, 'ogImage')
    const ogImageAlt = frontmatterStringValue(frontmatter, 'ogImageAlt')
    const ogImageWidth = ogImageDimensionValue(frontmatterScalarValue(frontmatter, 'ogImageWidth'), '1200')
    const ogImageHeight = ogImageDimensionValue(frontmatterScalarValue(frontmatter, 'ogImageHeight'), '630')
    expectOgImageMeta(content, relativePath, ogImage
      ? {
          image: docsAssetUrl(ogImage),
          alt: ogImageAlt,
          width: ogImageWidth,
          height: ogImageHeight,
        }
      : {
          image: docsOgImageUrl,
          alt: docsOgImageAlt,
          width: '1200',
          height: '630',
        })

    const structuredDataNodes = jsonLdNodesByRelativePath.get(relativePath) ?? parseStructuredDataNodes(content, relativePath)
    if (!hasStructuredDataType(structuredDataNodes, 'WebPage'))
      failures.push(`${relativePath} is missing WebPage structured data`)
  }

  for (const filePath of walkFiles(docsDir, new Set(['.vitepress', 'node_modules']))) {
    if (!filePath.endsWith('.md'))
      continue

    const frontmatter = readFrontmatter(filePath)
    const routePath = markdownRoutePath(filePath)
    const relativePath = htmlFileForMarkdown(filePath)
    const checks = []
    const isArticle = routePath.startsWith('/compare/') || routePath.startsWith('/zh/compare/')
    const ogImage = frontmatterStringValue(frontmatter, 'ogImage')
    const ogImageAlt = frontmatterStringValue(frontmatter, 'ogImageAlt')
    const ogImageWidth = ogImageDimensionValue(frontmatterScalarValue(frontmatter, 'ogImageWidth'), '1200')
    const ogImageHeight = ogImageDimensionValue(frontmatterScalarValue(frontmatter, 'ogImageHeight'), '630')

    if (ogImage && !ogImageAlt)
      failures.push(`${relativePath} has ogImage but is missing ogImageAlt`)

    if (ogImage && ogImage.toLowerCase().endsWith('.svg'))
      failures.push(`${relativePath} ogImage must be a raster image (PNG/JPG/WebP) — SVG is not supported by social crawlers: ${ogImage}`)

    if (hasFrontmatterKey(frontmatter, 'faq')) {
      checks.push(['FAQPage', 'structured data'])
      checks.push(['markstream-faq', 'visible FAQ section'])
    }

    if (hasFrontmatterKey(frontmatter, 'softwarePackage')) {
      checks.push(['SoftwareSourceCode', 'structured data'])
    }

    if (isArticle)
      checks.push(['Article', 'structured data'])

    if (checks.length === 0 && !ogImage)
      continue

    const content = readDistFile(relativePath)
    if (!content)
      continue

    const structuredDataNodes = jsonLdNodesByRelativePath.get(relativePath) ?? parseStructuredDataNodes(content, relativePath)

    for (const [marker, label] of checks) {
      const found = label === 'visible FAQ section'
        ? content.includes(marker)
        : hasStructuredDataType(structuredDataNodes, marker)

      if (!found)
        failures.push(`${relativePath} is missing ${marker} ${label}`)
    }

    const lastVerified = frontmatterStringValue(frontmatter, 'lastVerified')
    if (isArticle) {
      validateCompareFreshness(relativePath, lastVerified)
      if (!content.includes('Verification') && !content.includes('核验方式'))
        failures.push(`${relativePath} compare page is missing visible Verification section`)
      if (lastVerified) {
        expectMetaContent(content, relativePath, 'property', 'og:updated_time', lastVerified)
        expectMetaContent(content, relativePath, 'property', 'article:modified_time', lastVerified)
      }
    }

    if (ogImage) {
      const expectedOgImage = docsAssetUrl(ogImage)
      expectLocalOgImageAsset(ogImage, relativePath)
      expectOgImageMeta(content, relativePath, {
        image: expectedOgImage,
        alt: ogImageAlt,
        width: ogImageWidth,
        height: ogImageHeight,
      })
    }

    const softwareSourceCodeNode = findStructuredDataNode(structuredDataNodes, 'SoftwareSourceCode')
    if (softwareSourceCodeNode)
      validateSoftwareSourceCodeNode(softwareSourceCodeNode, relativePath)

    const faqPageNode = findStructuredDataNode(structuredDataNodes, 'FAQPage')
    if (faqPageNode)
      validateFaqPageNode(faqPageNode, relativePath)

    const articleNode = findStructuredDataNode(structuredDataNodes, 'Article')
    if (articleNode) {
      validateArticleNode(articleNode, relativePath, lastVerified)
    }
  }

  if (failures.length > 0) {
    console.error('[docs-seo-output] failed:')
    for (const failure of failures)
      console.error(`  - ${failure}`)
    process.exit(1)
  }

  console.log('[docs-seo-output] Docs host output, redirects, canonical tags, OG images, updated-time meta, LLM files, visible FAQ content, and JSON-LD nodes are valid.')
}
