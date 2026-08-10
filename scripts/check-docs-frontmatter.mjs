import { readdirSync, readFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import process from 'node:process'

const root = process.cwd()
const docsDir = resolve(root, 'docs')

const docsDefaultDescriptions = new Set([
  'Streaming Markdown renderers for AI apps across Vue, React, Svelte, Angular, Nuxt, and Next.js',
  '适用于 AI 应用的多框架流式 Markdown 渲染器家族',
])

// Must stay in sync with `seoExcludedDocsPaths` + the `.zh-CN` suffix rule in
// docs/.vitepress/config.ts (isDocsSeoExcluded).
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

const minDescriptionLength = 50
const minKeywordsCount = 2

const failures = []

function repoRelative(filePath) {
  return relative(root, filePath).replace(/\\/g, '/')
}

function docsRoutePath(filePath) {
  let route = `/${relative(docsDir, filePath).replace(/\\/g, '/').replace(/\.md$/, '')}`
  route = route.replace(/\/index$/, '/')
  return route === '/' ? '/' : route.replace(/\/$/, '')
}

function isDocsSeoExcluded(routePath) {
  return seoExcludedDocsPaths.has(routePath) || routePath.endsWith('.zh-CN')
}

function walkMarkdownFiles(dir) {
  const files = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.vitepress' || entry.name === 'node_modules')
      continue

    const absolutePath = resolve(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...walkMarkdownFiles(absolutePath))
    }
    else if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(absolutePath)
    }
  }

  return files
}

function parseFrontmatter(filePath) {
  const source = readFileSync(filePath, 'utf8')
  if (!source.startsWith('---\n'))
    return { raw: '', body: source }

  const endIndex = source.indexOf('\n---', 4)
  if (endIndex === -1)
    return { raw: '', body: source }

  return {
    raw: source.slice(4, endIndex),
    body: source.slice(endIndex + 4),
  }
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

function frontmatterListItems(frontmatter, key) {
  const lines = frontmatter.split('\n')
  const startIndex = lines.findIndex(line => line === `${key}:`)
  if (startIndex === -1)
    return []

  const items = []
  for (const line of lines.slice(startIndex + 1)) {
    if (/^\S[^:]*:/.test(line))
      break

    const trimmedLine = line.trim()
    const match = /^- (.+)$/.exec(trimmedLine)
    if (match) {
      items.push(match[1].replace(/^['"]|['"]$/g, ''))
    }
    else if (!/^\s*$/.test(line)) {
      break
    }
  }

  return items.filter(item => item.length > 0)
}

function stripFencedCodeBlocks(markdown) {
  const lines = markdown.split('\n')
  const keptLines = []
  let fenceChar = null

  for (const line of lines) {
    const fenceMatch = line.match(/^(`{3,}|~{3,})/)
    if (fenceMatch) {
      const currentFenceChar = fenceMatch[1][0]
      if (!fenceChar) {
        fenceChar = currentFenceChar
      }
      else if (fenceChar === currentFenceChar) {
        fenceChar = null
      }

      keptLines.push('')
      continue
    }

    keptLines.push(fenceChar ? '' : line)
  }

  return keptLines.join('\n')
}

function countH1(body) {
  return stripFencedCodeBlocks(body)
    .split('\n')
    .filter(line => /^#\s+\S/.test(line))
    .length
}

function rememberUnique(seenValues, value, filePath, label) {
  const normalizedValue = value.toLowerCase()
  const existingFile = seenValues.get(normalizedValue)
  if (existingFile) {
    failures.push(`${repoRelative(filePath)} duplicates ${label} from ${repoRelative(existingFile)}: ${value}`)
    return
  }

  seenValues.set(normalizedValue, filePath)
}

const titles = new Map()
const descriptions = new Map()

for (const filePath of walkMarkdownFiles(docsDir)) {
  const routePath = docsRoutePath(filePath)
  if (isDocsSeoExcluded(routePath))
    continue

  const { raw, body } = parseFrontmatter(filePath)
  const relativePath = repoRelative(filePath)
  const title = frontmatterStringValue(raw, 'title')
  const description = frontmatterStringValue(raw, 'description')
  const keywords = frontmatterListItems(raw, 'keywords')
  const isHomeLayout = /^layout:\s*home\s*$/m.test(raw)

  if (!raw) {
    failures.push(`${relativePath} is missing frontmatter (title, description, keywords)`)
    continue
  }

  if (!title) {
    failures.push(`${relativePath} is missing frontmatter title`)
  }
  else {
    if (title === 'Markstream')
      failures.push(`${relativePath} title must not be the generic site title`)

    rememberUnique(titles, title, filePath, 'title')
  }

  if (!description) {
    failures.push(`${relativePath} is missing frontmatter description`)
  }
  else {
    if (docsDefaultDescriptions.has(description))
      failures.push(`${relativePath} must not reuse the default docs description`)

    if (description.length < minDescriptionLength)
      failures.push(`${relativePath} description is too short (${description.length} chars, min ${minDescriptionLength})`)

    rememberUnique(descriptions, description, filePath, 'description')
  }

  if (keywords.length < minKeywordsCount)
    failures.push(`${relativePath} is missing frontmatter keywords list (need at least ${minKeywordsCount})`)

  const h1Count = countH1(body)
  if (!isHomeLayout && h1Count !== 1)
    failures.push(`${relativePath} must have exactly one visible H1; found ${h1Count}`)
}

if (failures.length > 0) {
  console.error('[docs-frontmatter] failed:')
  for (const failure of failures)
    console.error(`  - ${failure}`)
  process.exit(1)
}

console.log('[docs-frontmatter] Source SEO frontmatter checks passed.')
