import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { basename, join, relative, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const tmp = mkdtempSync(join(tmpdir(), 'markstream-vue-minimal-'))
let packedTarball = ''
let packedParserTarball = ''
let packedCoreTarball = ''

function run(command, args, options = {}) {
  execFileSync(command, args, {
    cwd: options.cwd ?? root,
    stdio: options.stdio ?? 'inherit',
    encoding: options.encoding ?? 'utf8',
    env: {
      ...process.env,
      CI: '1',
      npm_config_auto_install_peers: 'false',
    },
  })
}

function writeProjectFile(path, content) {
  const fullPath = join(tmp, path)
  mkdirSync(join(fullPath, '..'), { recursive: true })
  writeFileSync(fullPath, content)
}

function packWorkspacePackage(cwd) {
  const packOutput = execFileSync('pnpm', ['pack', '--pack-destination', tmp, '--json'], {
    cwd,
    encoding: 'utf8',
    env: process.env,
  }).trim()
  const packInfo = JSON.parse(packOutput)
  const packedFilename = Array.isArray(packInfo) ? packInfo[0]?.filename : packInfo?.filename
  if (!packedFilename)
    throw new Error('pnpm pack did not return a tarball name')

  const candidateTarballs = [
    resolve(packedFilename),
    resolve(tmp, basename(packedFilename)),
  ]
  const tarball = candidateTarballs.find(existsSync) ?? ''
  if (!tarball)
    throw new Error(`Packed tarball not found: ${packedFilename}`)
  return tarball
}

function readTarString(buffer) {
  const end = buffer.indexOf(0)
  return buffer.subarray(0, end === -1 ? buffer.length : end).toString('utf8').trim()
}

function readTgzEntry(tarball, entryName) {
  const archive = gunzipSync(readFileSync(tarball))
  let offset = 0
  while (offset + 512 <= archive.length) {
    const header = archive.subarray(offset, offset + 512)
    if (header.every(byte => byte === 0))
      break

    const name = readTarString(header.subarray(0, 100))
    const prefix = readTarString(header.subarray(345, 500))
    const path = prefix ? `${prefix}/${name}` : name
    const size = Number.parseInt(readTarString(header.subarray(124, 136)) || '0', 8)
    const bodyOffset = offset + 512

    if (path === entryName)
      return archive.subarray(bodyOffset, bodyOffset + size).toString('utf8')

    offset = bodyOffset + Math.ceil(size / 512) * 512
  }
  throw new Error(`Packed tarball entry not found: ${entryName}`)
}

function hasTgzPathPrefix(tarball, pathPrefix) {
  const archive = gunzipSync(readFileSync(tarball))
  let offset = 0
  while (offset + 512 <= archive.length) {
    const header = archive.subarray(offset, offset + 512)
    if (header.every(byte => byte === 0))
      break

    const name = readTarString(header.subarray(0, 100))
    const prefix = readTarString(header.subarray(345, 500))
    const path = prefix ? `${prefix}/${name}` : name
    const size = Number.parseInt(readTarString(header.subarray(124, 136)) || '0', 8)

    if (path === pathPrefix || path.startsWith(`${pathPrefix}/`))
      return true

    offset += 512 + Math.ceil(size / 512) * 512
  }
  return false
}

function ensureBuiltArtifacts() {
  const parserDist = join(root, 'packages/markdown-parser/dist/index.js')
  const coreDist = join(root, 'packages/markstream-core/dist/index.js')
  const rootDist = join(root, 'dist/index.js')

  if (!existsSync(parserDist))
    run('pnpm', ['run', 'build:parser'])

  if (!existsSync(coreDist))
    run('pnpm', ['run', 'build:core'])

  if (!existsSync(rootDist))
    run('pnpm', ['run', 'build'])
}

function ensureOptionalPeersAbsent() {
  const fixtureRequire = createRequire(join(tmp, 'package.json'))
  for (const pkg of [
    'stream-monaco',
    'mermaid',
    'katex',
    '@terrastruct/d2',
    '@antv/infographic',
    'vue-i18n',
    'stream-markdown',
  ]) {
    try {
      fixtureRequire.resolve(pkg)
    }
    catch {
      continue
    }
    throw new Error(`${pkg} should not be installed in minimal smoke`)
  }
}

function writeNodeNoDomTypecheckConfig() {
  const smokeRoot = realpathSync(tmp)
  const markstreamPackageDir = realpathSync(join(tmp, 'node_modules/markstream-vue'))
  const parserPackageDir = resolve(markstreamPackageDir, '..', 'stream-markdown-parser')
  const parserPackageJsonPath = join(parserPackageDir, 'package.json')
  const parserPackageJson = JSON.parse(readFileSync(parserPackageJsonPath, 'utf8'))
  const parserTypes = resolve(parserPackageDir, parserPackageJson.types ?? 'dist/index.d.ts')
  if (!existsSync(parserTypes))
    throw new Error(`stream-markdown-parser types not found for no-DOM check: ${parserTypes}`)

  writeProjectFile('tsconfig.node-no-dom.json', `${JSON.stringify({
    compilerOptions: {
      target: 'ES2020',
      module: 'ESNext',
      moduleResolution: 'Bundler',
      lib: ['ES2020'],
      strict: true,
      skipLibCheck: false,
      noEmit: true,
      types: [],
      baseUrl: '.',
      paths: {
        'stream-markdown-parser': [relative(smokeRoot, parserTypes).replace(/\\/g, '/')],
      },
    },
    include: ['node-no-dom.ts'],
  }, null, 2)}\n`)
}

try {
  if (process.env.MARKSTREAM_SMOKE_SKIP_BUILD !== '1') {
    run('pnpm', ['run', 'build:parser'])
    run('pnpm', ['build'])
  }
  else {
    ensureBuiltArtifacts()
  }

  packedParserTarball = packWorkspacePackage(join(root, 'packages/markdown-parser'))
  packedCoreTarball = packWorkspacePackage(join(root, 'packages/markstream-core'))
  packedTarball = packWorkspacePackage(root)

  const packedPackageJson = JSON.parse(readTgzEntry(packedTarball, 'package/package.json'))
  if (packedPackageJson.bin)
    throw new Error('Packed package must not publish a CLI bin')
  for (const internalPath of ['package/.agents', 'package/prompts', 'package/bin']) {
    if (hasTgzPathPrefix(packedTarball, internalPath))
      throw new Error(`Packed tarball leaked internal path: ${internalPath}`)
  }
  const dependencySections = [
    'dependencies',
    'peerDependencies',
    'optionalDependencies',
    'devDependencies',
  ]
  for (const section of dependencySections) {
    for (const [name, version] of Object.entries(packedPackageJson[section] ?? {})) {
      if (String(version).startsWith('workspace:'))
        throw new Error(`Packed ${section} leaked workspace protocol: ${name}@${version}`)
    }
  }
  for (const name of ['stream-markdown-parser', 'markstream-core']) {
    const version = packedPackageJson.dependencies?.[name]
    if (!version)
      throw new Error(`${name} missing from packed dependencies`)
    if (String(version).startsWith('workspace:'))
      throw new Error(`${name} leaked workspace protocol`)
    if (String(version).startsWith('file:'))
      throw new Error(`${name} leaked file protocol`)
  }

  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  const installOptionalPeers = process.env.MARKSTREAM_SMOKE_WITH_OPTIONAL_PEERS === '1'
  const smokePackage = {
    private: true,
    type: 'module',
    packageManager: pkg.packageManager,
    scripts: {
      'build': 'vite build',
      'typecheck:node-no-dom': 'tsc -p tsconfig.node-no-dom.json',
    },
    dependencies: {
      [pkg.name]: `file:${packedTarball}`,
      '@vitejs/plugin-vue': '^5.2.4',
      '@vue/server-renderer': '^3.5.31',
      'typescript': '^5.9.3',
      'vite': '^7.3.1',
      'vue': '^3.5.31',
    },
    devDependencies: {},
    pnpm: {
      onlyBuiltDependencies: ['esbuild'],
      overrides: {
        'stream-markdown-parser': `file:${packedParserTarball}`,
        'markstream-core': `file:${packedCoreTarball}`,
      },
    },
  }
  if (installOptionalPeers) {
    Object.assign(smokePackage.dependencies, {
      '@antv/infographic': '^0.2.3',
      '@terrastruct/d2': '>=0.1.33',
      'katex': '>=0.16.22',
      'mermaid': '>=11',
      'monaco-editor': '>=0.52.2 <0.56.0',
      'stream-markdown': '>=0.0.15',
      'stream-monaco': '>=0.0.40',
      'vue-i18n': '>=9',
    })
  }
  smokePackage.scripts['ssr:import'] = 'node ./ssr-import.mjs'
  writeProjectFile('package.json', `${JSON.stringify(smokePackage, null, 2)}\n`)

  writeProjectFile('index.html', '<div id="app"></div><script type="module" src="/src/main.ts"></script>\n')
  writeProjectFile('vite.config.ts', `import vue from '@vitejs/plugin-vue'\nimport { defineConfig } from 'vite'\n\nexport default defineConfig({ plugins: [vue()] })\n`)
  writeProjectFile('src/main.ts', `import { createApp, defineComponent, h } from 'vue'\nimport MarkdownRender, { VueRendererMarkdown, useSmoothMarkdownStream } from 'markstream-vue'\nimport safeList from 'markstream-vue/tailwind'\nimport { renderKaTeXInWorker } from 'markstream-vue/workers/katexWorkerClient'\nimport { findPrefixOffthread } from 'markstream-vue/workers/mermaidWorkerClient'\nimport { createKaTeXWorkerFromCDN } from 'markstream-vue/workers/katexCdnWorker'\nimport { createMermaidWorkerFromCDN } from 'markstream-vue/workers/mermaidCdnWorker'\nimport 'markstream-vue/index.css'\nimport 'markstream-vue/index.tailwind.css'\nimport 'markstream-vue/index.px.css'\nimport App from './App.vue'\n\nvoid useSmoothMarkdownStream\nvoid safeList\nvoid renderKaTeXInWorker\nvoid findPrefixOffthread\nvoid createKaTeXWorkerFromCDN\nvoid createMermaidWorkerFromCDN\n\nconst ThinkingNode = defineComponent({\n  name: 'SmokeThinkingNode',\n  setup(_, { slots }) {\n    return () => h('aside', { 'data-smoke-thinking': '1' }, slots.default?.() ?? [])\n  },\n})\n\ncreateApp(App)\n  .use(VueRendererMarkdown, { components: { thinking: ThinkingNode } })\n  .component('MarkdownRender', MarkdownRender)\n  .mount('#app')\n`)
  const smokeMarkdown = [
    '# Hello',
    '',
    '~~~ts',
    'console.log(1)',
    '~~~',
    '',
    '<div><a href="javascript:alert(1)">bad</a><span>safe</span></div>',
    '',
    '$$E = mc^2$$',
    '',
    '```mermaid',
    'flowchart TD',
    'A-->B',
    '```',
    '',
    '<thinking>app scoped component</thinking>',
    '',
    '```infographic',
    'infographic list-row-simple-horizontal-arrow',
    '```',
  ].join('\n')
  writeProjectFile('src/App.vue', `<script setup lang="ts">\nconst content = ${JSON.stringify(smokeMarkdown)}\n</script>\n\n<template>\n  <MarkdownRender :content="content" :final="true" :render-code-blocks-as-pre="true" />\n  <MarkdownRender :content="content" :final="true" />\n</template>\n`)
  writeProjectFile('node-no-dom.ts', `import { parseMarkdownToStructure, sanitizeMermaidSvg, toSafeMermaidSvgMarkup, toSafeSvgElement } from 'stream-markdown-parser'\n\nvoid parseMarkdownToStructure\nvoid sanitizeMermaidSvg\nvoid toSafeMermaidSvgMarkup\nvoid toSafeSvgElement\n`)
  const ssrMarkdown = [
    '~~~ts',
    'console.log(1)',
    '~~~',
    '',
    '<a href="javascript:alert(1)">bad</a>',
  ].join('\n')
  writeProjectFile('ssr-import.mjs', `import { existsSync } from 'node:fs'\nimport { fileURLToPath } from 'node:url'\nimport { createSSRApp, defineComponent, h } from 'vue'\nimport { renderToString } from '@vue/server-renderer'\nimport MarkdownRender, { MarkdownRender as NamedMarkdownRender, VueRendererMarkdown } from 'markstream-vue'\n\nconst mod = await import('markstream-vue')\nif (!mod.default || !mod.MarkdownRender || !NamedMarkdownRender)\n  throw new Error('Root package import did not expose MarkdownRender')\n\nfor (const cssSpecifier of ['markstream-vue/index.css', 'markstream-vue/index.tailwind.css', 'markstream-vue/index.px.css']) {\n  const cssUrl = import.meta.resolve(cssSpecifier)\n  if (!existsSync(fileURLToPath(cssUrl)))\n    throw new Error(\`\${cssSpecifier} export did not resolve to a file\`)\n}\n\nawait import('markstream-vue/workers/katexWorkerClient')\nawait import('markstream-vue/workers/mermaidWorkerClient')\nawait import('markstream-vue/workers/katexCdnWorker')\nawait import('markstream-vue/workers/mermaidCdnWorker')\n\nfor (const workerSpecifier of ['markstream-vue/workers/katexRenderer.worker', 'markstream-vue/workers/mermaidParser.worker']) {\n  const workerUrl = import.meta.resolve(workerSpecifier)\n  if (!existsSync(fileURLToPath(workerUrl)))\n    throw new Error(\`\${workerSpecifier} export did not resolve to a packed file\`)\n}\n\nconst tailwind = await import('markstream-vue/tailwind')\nif (typeof tailwind.default !== 'string' || !tailwind.default.includes('markstream-vue'))\n  throw new Error('Tailwind export did not expose the generated safelist')\n\nconst ThinkingNode = defineComponent({\n  name: 'SsrSmokeThinkingNode',\n  setup(_, { slots }) {\n    return () => h('aside', { 'data-ssr-smoke-thinking': '1' }, slots.default?.() ?? [])\n  },\n})\n\nconst app = createSSRApp({\n  render: () => h(MarkdownRender, {\n    content: ${JSON.stringify(`${ssrMarkdown}\\n\\n<thinking>ssr app component</thinking>`)},\n    final: true,\n  }),\n})\napp.use(VueRendererMarkdown, { components: { thinking: ThinkingNode } })\n\nconst html = await renderToString(app)\n\nif (!html || !html.includes('console.log'))\n  throw new Error('SSR render did not include code content')\n\nif (!html.includes('data-ssr-smoke-thinking'))\n  throw new Error('SSR app-scoped custom component did not render')\n\nif (/javascript:alert/i.test(html))\n  throw new Error('SSR render kept unsafe javascript URL')\n`)

  run('pnpm', ['install', '--ignore-workspace'], { cwd: tmp })
  if (!installOptionalPeers)
    ensureOptionalPeersAbsent()
  writeNodeNoDomTypecheckConfig()
  run('pnpm', ['run', 'typecheck:node-no-dom'], { cwd: tmp })
  run('pnpm', ['run', 'build'], { cwd: tmp })
  run('pnpm', ['run', 'ssr:import'], { cwd: tmp })

  console.log(`[smoke-minimal-install] Passed in ${tmp}`)
}
finally {
  for (const tarball of [packedTarball, packedParserTarball, packedCoreTarball]) {
    if (tarball && existsSync(tarball))
      rmSync(tarball)
  }
  if (process.env.KEEP_MARKSTREAM_SMOKE_DIR !== '1')
    rmSync(tmp, { recursive: true, force: true })
  else
    console.log(`[smoke-minimal-install] Preserved ${pathToFileURL(tmp).href} (${basename(tmp)})`)
}
