import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const jsOutput = resolve('dist/tailwind.js')
const output = resolve('dist/tailwind.d.ts')

if (existsSync(jsOutput)) {
  const source = readFileSync(jsOutput, 'utf8')
  writeFileSync(jsOutput, source.replace(/\n?module\.exports = safeList;\n?/g, '\n'))
}

writeFileSync(output, `export declare const safeList: string\nexport default safeList\n`)
