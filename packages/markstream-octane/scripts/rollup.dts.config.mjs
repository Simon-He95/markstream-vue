import fs from 'node:fs'
import path from 'node:path'
import dts from 'rollup-plugin-dts'

const entryNames = ['index', 'server']

export default entryNames.map((entryName) => {
  const input = path.resolve(`dist/types/${entryName}.d.ts`)
  if (!fs.existsSync(input))
    throw new Error(`Missing declaration entry: ${input}`)

  return {
    input,
    plugins: [dts({ respectExternal: false })],
    external: [
      /^node:.*$/,
      /^octane(?:\/.*)?$/,
      /^(?:katex|mermaid|stream-diffs)(?:\/.*)?$/,
      /^stream-markdown-parser(?:\/.*)?$/,
      /^markstream-core(?:\/.*)?$/,
      /^@antv\/infographic(?:\/.*)?$/,
      /^@floating-ui\/dom(?:\/.*)?$/,
      /\?worker$/,
    ],
    output: {
      file: `dist/${entryName}.d.ts`,
      format: 'es',
    },
  }
})
