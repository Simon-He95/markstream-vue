import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import process from 'node:process'
import ts from 'typescript'

const root = process.cwd()
const dtsPath = join(root, 'dist', 'index.d.ts')
const snapshotPath = join(root, 'test', 'public-api', 'public-api.snapshot.txt')
const requiredListPath = join(root, 'test', 'public-api', 'required-exports.txt')
const shouldUpdate = process.argv.includes('--update')
const strictVisibleSnapshot = process.env.PUBLIC_API_STRICT === 'true' || process.argv.includes('--strict')

if (!existsSync(dtsPath))
  fail(`Missing ${relative(root, dtsPath)}. Run pnpm build first.`)

const integrityTsconfigPath = join(root, 'tsconfig.public-api.package.json')

function readCompilerOptions(tsconfigPath) {
  const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile)

  if (configFile.error) {
    fail(
      ts.flattenDiagnosticMessageText(
        configFile.error.messageText,
        '\n',
      ),
    )
  }

  const parsed = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    root,
  )

  if (parsed.errors.length > 0) {
    const formatHost = {
      getCanonicalFileName: fileName => fileName,
      getCurrentDirectory: () => root,
      getNewLine: () => '\n',
    }

    fail(ts.formatDiagnosticsWithColorAndContext(parsed.errors, formatHost))
  }

  return parsed.options
}

const compilerOptions = {
  ...readCompilerOptions(integrityTsconfigPath),
  skipLibCheck: false,
}

const allExports = collectPublicApiExports(dtsPath, compilerOptions)
const requiredNames = loadRequiredExportNames(requiredListPath)

// Check that every required export is present before any snapshot logic.
// This ensures required-exports.txt is enforced even when --update is passed.
const presentNames = new Set(allExports.map(e => e.name))
const missingRequired = requiredNames.filter(name => !presentNames.has(name))
if (missingRequired.length > 0) {
  fail(
    `[public-api] Required exports missing from dist/index.d.ts:\n${
      missingRequired.map(n => `  - ${n}`).join('\n')
    }\n\nIf this was intentional, update test/public-api/required-exports.txt.`,
  )
}

const nextSnapshot = `${allExports.map(e => e.line).join('\n')}\n`

if (shouldUpdate) {
  mkdirSync(dirname(snapshotPath), { recursive: true })
  writeFileSync(snapshotPath, nextSnapshot, 'utf8')
  console.log(`[public-api] Updated ${relative(root, snapshotPath)}`)
  process.exit(0)
}

if (!existsSync(snapshotPath))
  fail(`Missing ${relative(root, snapshotPath)}. Run pnpm test:api:update to create it.`)

const currentSnapshot = normalizeSnapshot(readFileSync(snapshotPath, 'utf8'))

if (currentSnapshot !== nextSnapshot) {
  const diff = formatSnapshotDiff(currentSnapshot, nextSnapshot)

  if (strictVisibleSnapshot)
    fail(diff)

  console.warn(diff)
  console.warn('[public-api] Visible export surface changed, but --strict / PUBLIC_API_STRICT was not set.')
}

// Log the required/other split as informational
const requiredPresent = requiredNames.filter(n => presentNames.has(n))
const otherPresent = [...presentNames].filter(n => !requiredNames.includes(n))
console.log(`[public-api] Visible snapshot checked against ${relative(root, snapshotPath)}`)
console.log(`[public-api] Required exports: ${requiredPresent.length}, Other exports: ${otherPresent.length}`)

// ---- helpers ----

function collectPublicApiExports(entryPath, compilerOptions) {
  const host = ts.createCompilerHost(compilerOptions, true)
  const program = ts.createProgram([entryPath], compilerOptions, host)
  const diagnostics = ts.getPreEmitDiagnostics(program)

  if (diagnostics.length > 0) {
    const formatHost = {
      getCanonicalFileName: fileName => fileName,
      getCurrentDirectory: () => root,
      getNewLine: () => '\n',
    }

    fail(ts.formatDiagnosticsWithColorAndContext(diagnostics, formatHost))
  }

  const sourceFile = program.getSourceFile(entryPath)

  if (!sourceFile)
    fail(`Unable to read ${relative(root, entryPath)}`)

  const checker = program.getTypeChecker()
  const moduleSymbol = checker.getSymbolAtLocation(sourceFile)

  if (!moduleSymbol)
    fail(`Unable to resolve exports for ${relative(root, entryPath)}`)

  return checker
    .getExportsOfModule(moduleSymbol)
    .map((symbol) => {
      const resolved = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol
      const kinds = []

      if (resolved.flags & ts.SymbolFlags.Value)
        kinds.push('value')
      if (resolved.flags & ts.SymbolFlags.Type)
        kinds.push('type')
      if (resolved.flags & ts.SymbolFlags.Namespace)
        kinds.push('namespace')

      const name = symbol.getName()
      const kind = kinds.join('+') || 'unknown'
      return { name, kind, line: `${name} [${kind}]` }
    })
    .sort((left, right) => left.line.localeCompare(right.line))
}

function loadRequiredExportNames(filePath) {
  if (!existsSync(filePath))
    fail(`Missing ${relative(root, filePath)}. Create it with one export name per line.`)

  return readFileSync(filePath, 'utf8')
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'))
}

function normalizeSnapshot(snapshot) {
  return `${snapshot.replace(/\r\n/g, '\n').trimEnd()}\n`
}

function formatSnapshotDiff(currentSnapshot, nextSnapshot) {
  const currentLines = new Set(currentSnapshot.trim().split('\n').filter(Boolean))
  const nextLines = new Set(nextSnapshot.trim().split('\n').filter(Boolean))
  const added = [...nextLines].filter(line => !currentLines.has(line)).sort()
  const removed = [...currentLines].filter(line => !nextLines.has(line)).sort()
  const sections = ['[public-api] Visible snapshot changed. Run pnpm test:api:update to accept the change.']

  if (added.length > 0)
    sections.push(`\nAdded:\n${added.map(line => `+ ${line}`).join('\n')}`)

  if (removed.length > 0)
    sections.push(`\nRemoved:\n${removed.map(line => `- ${line}`).join('\n')}`)

  return sections.join('\n')
}

function fail(message) {
  console.error(message)
  process.exit(1)
}
