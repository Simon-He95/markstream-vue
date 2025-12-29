const fs = require('node:fs')
const path = require('node:path')
const process = require('node:process')

const distDir = path.resolve(__dirname, '..', 'dist')
const typesDir = path.join(distDir, 'types')

if (fs.existsSync(typesDir)) {
  try {
    fs.rmSync(typesDir, { recursive: true, force: true })
    console.log('Removed', typesDir)
  }
  catch (e) {
    console.error('Failed to remove', typesDir, e)
    process.exit(1)
  }
}

const bundledDts = path.join(distDir, 'index.d.ts')
const propsDtsCandidates = [
  path.join(distDir, 'types', 'types', 'props-export.d.ts'),
  path.join(distDir, 'types', 'types', 'component-props.d.ts'),
]

for (const candidate of propsDtsCandidates) {
  if (fs.existsSync(candidate) && fs.existsSync(bundledDts)) {
    try {
      const content = fs.readFileSync(candidate, 'utf8')
      const candidateFirstExport = /export\s+interface\s+(\w+)/.exec(content)
      const already = candidateFirstExport
        && new RegExp(`interface\\s+${candidateFirstExport[1]}`).test(fs.readFileSync(bundledDts, 'utf8'))
      if (!already) {
        fs.appendFileSync(
          bundledDts,
          `\n\n// Appended props types from ${path.relative(path.resolve(__dirname, '..'), candidate)}\n${content}`,
        )
        console.log('Appended types from', candidate, 'to', bundledDts)
      }
    }
    catch (e) {
      console.error('Failed to append types from', candidate, e)
    }
  }
}
