import fs from 'node:fs'
import path from 'node:path'
import dts from 'rollup-plugin-dts'

const fallbackInput = './dist/index.d.ts'
const preferredInput = './dist/types/exports.d.ts'

const preferredExists = fs.existsSync(path.resolve(preferredInput))
const fallbackExists = fs.existsSync(path.resolve(fallbackInput))

if (!preferredExists && !fallbackExists) {
  throw new Error(
    'No declaration entry found. Run the build first to emit declarations before running build:dts.',
  )
}

const inputPath = preferredExists ? preferredInput : fallbackInput

export default [
  {
    input: inputPath,
    plugins: [
      dts({
        respectExternal: false,
      }),
    ],
    external: [
      /^stream-markdown-parser(?:\/.*)?$/,
    ],
    output: [
      {
        file: 'dist/index.d.ts',
        format: 'es',
      },
    ],
  },
]
