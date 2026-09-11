#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build, createServer } from 'vite'
import solid from 'vite-plugin-solid'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(root, 'hydration-dist')

const server = await createServer({
  root,
  configFile: false,
  plugins: [
    solid({
      ssr: true,
      solid: { hydratable: true },
    }),
  ],
  server: { middlewareMode: true },
  appType: 'custom',
  ssr: {
    external: [
      'markstream-solid',
      'solid-js',
      'solid-js/web',
      'stream-markdown-parser',
      'markstream-core',
    ],
  },
})

try {
  const mod = await server.ssrLoadModule('/src/hydration/entry-server.tsx')
  const { body, bootstrap } = mod.renderHydrationFixture()
  if (!String(body).includes('Server rendered Solid'))
    throw new Error('hydration:generate did not emit the fixture heading')
  if (!String(bootstrap).includes('_$HY') && !String(bootstrap).includes('hydration'))
    throw new Error('hydration:generate did not emit Solid hydration bootstrap')

  await build({
    root,
    configFile: path.join(root, 'vite.config.ts'),
    mode: 'development',
    build: {
      outDir: path.join(outDir, 'client'),
      emptyOutDir: true,
      rollupOptions: {
        input: path.join(root, 'src/hydration/entry-client.tsx'),
        output: {
          entryFileNames: 'hydration.js',
          chunkFileNames: 'chunks/[name].js',
          assetFileNames: 'assets/[name][extname]',
        },
      },
    },
  })

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>markstream-solid hydration fixture</title>
    ${bootstrap}
  </head>
  <body>
    <div id="app">${body}</div>
    <script type="module" src="./client/hydration.js"></script>
  </body>
</html>
`
  await mkdir(outDir, { recursive: true })
  await writeFile(path.join(outDir, 'index.html'), html)
  console.log(`hydration:generate wrote ${path.join(outDir, 'index.html')}`)
}
finally {
  await server.close()
}
