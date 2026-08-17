import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const temporaryProject = mkdtempSync(join(tmpdir(), 'markstream-octane-pack-'))
const packedTarballs = []

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
  if (!existsSync(join(root, 'packages/markdown-parser/dist/index.js')))
    run('pnpm', ['run', 'build:parser'])

  if (!existsSync(join(root, 'packages/markstream-core/dist/index.js')))
    run('pnpm', ['run', 'build:core'])

  if (!existsSync(join(root, 'packages/markstream-octane/dist/client/index.js')))
    run('pnpm', ['--filter', 'markstream-octane', 'build'])

  const parserTarball = packWorkspacePackage(join(root, 'packages/markdown-parser'))
  const coreTarball = packWorkspacePackage(join(root, 'packages/markstream-core'))
  const octaneRendererTarball = packWorkspacePackage(join(root, 'packages/markstream-octane'))
  const rootPackageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

  writeProjectFile('package.json', `${JSON.stringify({
    private: true,
    type: 'module',
    packageManager: rootPackageJson.packageManager,
    scripts: {
      typecheck: 'tsrx-tsc --noEmit -p tsconfig.json',
    },
    dependencies: {
      'markstream-octane': `file:${octaneRendererTarball}`,
      'octane': '^0.1.21',
      'react': '^19.2.0',
      'react-dom': '^19.2.0',
    },
    devDependencies: {
      '@tsrx/core': '0.1.56',
      '@tsrx/typescript-plugin': '^0.3.118',
      'typescript': '^5.9.3',
      'vite': '^8.0.16',
    },
    pnpm: {
      overrides: {
        'markstream-core': `file:${coreTarball}`,
        'stream-markdown-parser': `file:${parserTarball}`,
      },
    },
  }, null, 2)}\n`)

  writeProjectFile('tsconfig.json', `${JSON.stringify({
    tsrx: {
      compiler: 'octane/compiler',
    },
    compilerOptions: {
      jsx: 'react-jsx',
      jsxImportSource: 'octane',
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

  writeProjectFile('src/App.tsrx', `import type { NodeRendererProps } from 'markstream-octane'\nimport { NodeRenderer } from 'markstream-octane'\n\nconst props = {\n  content: '# Packed Octane consumer',\n  final: true,\n} satisfies NodeRendererProps\n\nexport function App() {\n  return <NodeRenderer {...props} />\n}\n`)

  writeProjectFile('smoke-server.mjs', `import { existsSync } from 'node:fs'\nimport { createRequire } from 'node:module'\nimport { fileURLToPath } from 'node:url'\nimport { renderToStaticMarkup } from 'octane/server'\n\nconst root = await import('markstream-octane')\nconst server = await import('markstream-octane/server')\nif (!root.default || !root.NodeRenderer || !server.default || !server.NodeRenderer)\n  throw new Error('markstream-octane did not expose its root and server renderers')\n\nconst output = renderToStaticMarkup(server.NodeRenderer, {\n  content: '# Packed server render',\n  final: true,\n})\nif (!output.html.includes('Packed server render') || !output.html.includes('markstream-octane'))\n  throw new Error('Packed server renderer did not produce Octane HTML')\n\nconst tailwind = await import('markstream-octane/tailwind')\nif (typeof (tailwind.default || tailwind.safeList) !== 'string')\n  throw new Error('markstream-octane/tailwind did not expose the generated safelist')\n\nconst require = createRequire(import.meta.url)\nconst tailwindCjs = require('markstream-octane/tailwind')\nif (typeof (tailwindCjs.default || tailwindCjs.safeList || tailwindCjs) !== 'string')\n  throw new Error('markstream-octane/tailwind require did not expose the generated safelist')\n\nfor (const specifier of [\n  'markstream-octane/index.css',\n  'markstream-octane/index.px.css',\n  'markstream-octane/index.tailwind.css',\n  'markstream-octane/workers/katexRenderer.worker',\n  'markstream-octane/workers/mermaidParser.worker',\n]) {\n  const fileUrl = import.meta.resolve(specifier)\n  if (!existsSync(fileURLToPath(fileUrl)))\n    throw new Error(\`\${specifier} did not resolve to an installed file\`)\n}\n`)

  writeProjectFile('smoke-client.mjs', `const client = await import('markstream-octane')\nif (!client.default || !client.NodeRenderer)\n  throw new Error('Browser-conditioned root import did not expose NodeRenderer')\n`)

  run('pnpm', ['install', '--ignore-workspace'], { cwd: temporaryProject })
  run('pnpm', ['run', 'typecheck'], { cwd: temporaryProject })
  run('node', ['smoke-server.mjs'], { cwd: temporaryProject })
  run('node', ['--conditions=browser', 'smoke-client.mjs'], { cwd: temporaryProject })

  console.log(`[smoke-octane-packed-package] Packed Octane package smoke passed in ${temporaryProject}`)
}
finally {
  for (const tarball of packedTarballs) {
    if (existsSync(tarball))
      rmSync(tarball)
  }

  if (process.env.KEEP_MARKSTREAM_SMOKE_DIR !== '1')
    rmSync(temporaryProject, { recursive: true, force: true })
  else
    console.log(`[smoke-octane-packed-package] Preserved ${temporaryProject}`)
}
