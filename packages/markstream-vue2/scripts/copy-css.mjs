import { copyFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const src = resolve('src/index.css')
const dest = resolve('dist/index.css')

await copyFile(src, dest)
