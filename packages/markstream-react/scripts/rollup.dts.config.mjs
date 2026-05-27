import fs from 'node:fs'
import path from 'node:path'
import dts from 'rollup-plugin-dts'

const entryNames = ['index', 'next', 'server']

function resolveInputPath(entryName) {
  const preferred = [
    `./dist/types/${entryName}.d.ts`,
    entryName === 'index' ? './dist/types/exports.d.ts' : null,
    `./dist/${entryName}.d.ts`,
  ].filter(Boolean)

  return preferred.find(p => fs.existsSync(path.resolve(p))) ?? null
}

const configs = entryNames.map((entryName) => {
  const inputPath = resolveInputPath(entryName)
  if (!inputPath) {
    throw new Error(
      `No declaration entry found for "${entryName}". Run \`pnpm run build\` before running \`build:dts\`.`,
    )
  }

  return {
    input: inputPath,
    plugins: [
      dts({
        respectExternal: false,
      }),
    ],
    external: [
      /^node:.*$/,
      /^react(?:\/.*)?$/,
      /^react-dom(?:\/.*)?$/,
      /^(?:katex|mermaid|stream-monaco|stream-markdown)(?:\/.*)?$/,
      /^stream-markdown-parser(?:\/.*)?$/,
      /^markstream-core(?:\/.*)?$/,
      /^@antv\/infographic(?:\/.*)?$/,
      /^@floating-ui\/dom(?:\/.*)?$/,
    ],
    output: [
      {
        file: `dist/${entryName}.d.ts`,
        format: 'es',
      },
    ],
  }
})

export default configs
