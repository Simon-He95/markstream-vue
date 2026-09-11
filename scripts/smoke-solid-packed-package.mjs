#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const withOptionalPeers = process.env.MARKSTREAM_SMOKE_WITH_OPTIONAL_PEERS === '1'
const temporaryProject = mkdtempSync(join(tmpdir(), withOptionalPeers ? 'markstream-solid-pack-optional-' : 'markstream-solid-pack-'))
const packedTarballs = []
const fixtureMarkdown = '# Packed Solid heading\n\nInline $E=mc^2$\n\n```mermaid\nflowchart LR\nA-->B\n```'

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
  const fullPath = join(temporaryProject, path)
  mkdirSync(join(fullPath, '..'), { recursive: true })
  writeFileSync(fullPath, content)
}

function packWorkspacePackage(cwd) {
  const packOutput = execFileSync('pnpm', ['pack', '--pack-destination', temporaryProject, '--json'], {
    cwd,
    encoding: 'utf8',
    env: process.env,
  }).trim()
  const packInfo = JSON.parse(packOutput)
  const packedFilename = Array.isArray(packInfo) ? packInfo[0]?.filename : packInfo?.filename
  if (!packedFilename)
    throw new Error('pnpm pack did not return a tarball name')

  const tarball = [
    resolve(packedFilename),
    resolve(temporaryProject, basename(packedFilename)),
  ].find(existsSync)

  if (!tarball)
    throw new Error(`Packed tarball not found: ${packedFilename}`)

  packedTarballs.push(tarball)
  return tarball
}

try {
  if (process.env.MARKSTREAM_SMOKE_SKIP_BUILD !== '1') {
    if (!existsSync(join(root, 'packages/markdown-parser/dist/index.js')))
      run('pnpm', ['run', 'build:parser'])
    if (!existsSync(join(root, 'packages/markstream-core/dist/index.js')))
      run('pnpm', ['run', 'build:core'])
    if (!existsSync(join(root, 'packages/markstream-solid/dist/index.js')))
      run('pnpm', ['--filter', 'markstream-solid', 'build'])
  }

  const parserTarball = packWorkspacePackage(join(root, 'packages/markdown-parser'))
  const coreTarball = packWorkspacePackage(join(root, 'packages/markstream-core'))
  const solidTarball = packWorkspacePackage(join(root, 'packages/markstream-solid'))
  const rootPackageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  const optionalDependencies = withOptionalPeers
    ? {
        '@antv/infographic': '^0.2.3',
        '@terrastruct/d2': '>=0.1.33',
        'katex': '>=0.16.22',
        'mermaid': '>=11',
        'stream-diffs': '>=0.0.2',
      }
    : {}

  writeProjectFile('package.json', `${JSON.stringify({
    private: true,
    type: 'module',
    packageManager: rootPackageJson.packageManager,
    scripts: {
      typecheck: 'tsc --noEmit -p tsconfig.json',
      build: 'vite build',
    },
    dependencies: {
      'markstream-solid': `file:${solidTarball}`,
      'solid-js': '^1.9.15',
      ...optionalDependencies,
    },
    devDependencies: {
      'typescript': '^5.9.3',
      'vite': '^7.3.6',
      'vite-plugin-solid': '^2.11.14',
    },
    pnpm: {
      overrides: {
        'markstream-core': `file:${coreTarball}`,
        'stream-markdown-parser': `file:${parserTarball}`,
      },
    },
  }, null, 2)}\n`)

  writeProjectFile('tsconfig.json', `${JSON.stringify({
    compilerOptions: {
      jsx: 'preserve',
      jsxImportSource: 'solid-js',
      lib: ['ESNext', 'DOM'],
      module: 'ESNext',
      moduleResolution: 'Bundler',
      noEmit: true,
      skipLibCheck: true,
      strict: true,
      target: 'ESNext',
    },
    include: ['src/**/*'],
  }, null, 2)}\n`)

  writeProjectFile('vite.config.ts', `import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'

const optionalPeers = ${JSON.stringify(['katex', 'mermaid', '@terrastruct/d2', '@antv/infographic', 'stream-diffs', 'stream-diffs/markstream'])}

export default defineConfig({
  plugins: [solid()],
  build: {
    rollupOptions: {
      input: 'index.html',
      external: ${withOptionalPeers ? '[]' : 'optionalPeers'},
    },
  },
})
`)

  writeProjectFile('index.html', `<!doctype html>
<html>
  <head><meta charset="utf-8" /><title>solid packed consumer</title></head>
  <body><div id="app"></div><script type="module" src="/src/main.tsx"></script></body>
</html>
`)

  writeProjectFile('src/main.tsx', `import MarkdownRender from 'markstream-solid'
import { render } from 'solid-js/web'
import 'markstream-solid/index.css'

render(
  () => <MarkdownRender content=${JSON.stringify(fixtureMarkdown)} final />,
  document.getElementById('app')!,
)
`)

  writeProjectFile('src/App.tsx', `import type { MarkdownRenderProps } from 'markstream-solid'
import MarkdownRender from 'markstream-solid'

const props = {
  content: ${JSON.stringify(fixtureMarkdown)},
  final: true,
} satisfies MarkdownRenderProps

export function App() {
  return <MarkdownRender {...props} />
}
`)

  writeProjectFile('smoke-ssr.mjs', `import { createComponent } from 'solid-js'
import { renderToString } from 'solid-js/web'
import MarkdownRender, { NodeRenderer } from 'markstream-solid'

if (!MarkdownRender || !NodeRenderer)
  throw new Error('markstream-solid did not expose MarkdownRender / NodeRenderer')

const html = renderToString(() => createComponent(MarkdownRender, {
  content: ${JSON.stringify(fixtureMarkdown)},
  final: true,
}))

if (!html.includes('Packed Solid heading'))
  throw new Error('Packed Solid SSR did not render the fixture heading')
if (!html.includes('flowchart LR') && !html.includes('A-->B'))
  throw new Error('Packed Solid SSR dropped the mermaid source')
${withOptionalPeers ? '' : 'if (html.includes(\'class="katex"\')) throw new Error(\'Packed Solid SSR rendered KaTeX without the katex peer\')\n'}
if (!html.includes('data-hk'))
  throw new Error('Packed Solid SSR did not emit hydratable markup')
console.log('[smoke-ssr] heading and mermaid source present')
`)

  writeProjectFile('smoke-resolve.mjs', `import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

for (const specifier of [
  'markstream-solid/index.css',
  'markstream-solid/index.px.css',
  'markstream-solid/index.tailwind.css',
  'markstream-solid/workers/katexRenderer.worker',
  'markstream-solid/workers/mermaidParser.worker',
  'markstream-solid/workers/katexWorkerClient',
  'markstream-solid/workers/mermaidWorkerClient',
]) {
  const fileUrl = import.meta.resolve(specifier)
  if (!existsSync(fileURLToPath(fileUrl)))
    throw new Error(\`\${specifier} did not resolve to an installed file\`)
}
`)

  writeProjectFile('smoke-client.mjs', `import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const cssUrl = import.meta.resolve('markstream-solid/index.css')
const clientPath = join(dirname(fileURLToPath(cssUrl)), 'index.js')
if (!existsSync(clientPath))
  throw new Error('Browser ESM entry markstream-solid/dist/index.js is missing')
`)

  run('pnpm', ['install', '--ignore-workspace'], { cwd: temporaryProject })

  if (!withOptionalPeers) {
    for (const peer of ['katex', 'mermaid', '@terrastruct/d2', '@antv/infographic', 'stream-diffs']) {
      if (existsSync(join(temporaryProject, 'node_modules', peer)))
        throw new Error(`Optional peer ${peer} was installed in the missing-peer consumer`)
    }
  }

  run('pnpm', ['run', 'typecheck'], { cwd: temporaryProject })
  run('node', ['smoke-ssr.mjs'], { cwd: temporaryProject })
  run('node', ['smoke-resolve.mjs'], { cwd: temporaryProject })
  run('node', ['smoke-client.mjs'], { cwd: temporaryProject })
  run('pnpm', ['run', 'build'], { cwd: temporaryProject })

  console.log(`[smoke-solid-packed-package] ${withOptionalPeers ? 'optional peers present' : 'optional peers absent'} passed in ${temporaryProject}`)
}
finally {
  for (const tarball of packedTarballs) {
    if (existsSync(tarball))
      rmSync(tarball)
  }

  if (process.env.KEEP_MARKSTREAM_SMOKE_DIR !== '1')
    rmSync(temporaryProject, { recursive: true, force: true })
  else
    console.log(`[smoke-solid-packed-package] Preserved ${temporaryProject}`)
}
