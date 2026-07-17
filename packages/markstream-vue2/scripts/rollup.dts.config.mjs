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
      {
        name: 'normalize-vue-demi-imports',
        transform(code, id) {
          if (!id.endsWith('.d.ts'))
            return null
          const rewritten = code
            .replace(/from\s+['"](?:\.\.\/)+vue-demi['"]/g, 'from \'vue-demi\'')
            .replace(/import\(\s*['"](?:\.\.\/)+vue-demi['"]\s*\)/g, 'import(\'vue-demi\')')
          if (rewritten === code)
            return null
          return { code: rewritten, map: null }
        },
      },
      dts({
        respectExternal: false,
      }),
    ],
    external: [
      /^stream-diffs(?:\/.*)?$/,
      /^stream-markdown-parser(?:\/.*)?$/,
      /^markstream-core(?:\/.*)?$/,
      /^vue-demi(?:\/.*)?$/,
    ],
    output: [
      {
        file: 'dist/index.d.ts',
        format: 'es',
      },
    ],
  },
]
