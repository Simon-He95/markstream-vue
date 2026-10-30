import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

const packageRoot = path.resolve(import.meta.dirname, '..')
const repoRoot = path.resolve(packageRoot, '../..')
const visited = new Set()
async function publicValues(filename) {
  if (visited.has(filename))
    return new Set()
  visited.add(filename)
  const source = ts.createSourceFile(filename, readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true)
  const values = new Set()
  for (const statement of source.statements) {
    if (ts.isExportDeclaration(statement) && !statement.isTypeOnly) {
      if (statement.exportClause && ts.isNamedExports(statement.exportClause)) {
        for (const element of statement.exportClause.elements) {
          if (!element.isTypeOnly)
            values.add(element.name.text)
        }
      }
      else if (statement.moduleSpecifier) {
        const id = statement.moduleSpecifier.text
        if (id.startsWith('.')) {
          const target = path.resolve(path.dirname(filename), id)
          const resolved = [target, `${target}.ts`, path.join(target, 'index.ts')].find(filename => existsSync(filename) && filename.endsWith('.ts'))
          assert.ok(resolved, `Cannot inspect ${id}`)
          for (const name of await publicValues(resolved)) values.add(name)
        }
        else if (id === 'stream-markdown-parser') {
          for (const name of Object.keys(await import('stream-markdown-parser'))) {
            if (name !== 'default')
              values.add(name)
          }
        }
      }
    }
    if (statement.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)) {
      if (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement))
        values.add(statement.name.text)
      if (ts.isVariableStatement(statement)) {
        for (const declaration of statement.declarationList.declarations) {
          if (ts.isIdentifier(declaration.name))
            values.add(declaration.name.text)
        }
      }
    }
  }
  return values
}
const required = await publicValues(path.join(repoRoot, 'src/exports.ts'))
// Vue's app.install binding is replaced by native Solid component/context APIs.
required.delete('VueRendererMarkdown')
const solid = await import(pathToFileURL(path.join(packageRoot, 'dist/server/index.js')).href)
const missing = [...required].filter(name => !(name in solid))
assert.deepEqual(missing, [], 'Missing Vue 3 runtime API counterparts')
function properties(filename, name) {
  const source = ts.createSourceFile(filename, readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true)
  const declaration = source.statements.find(statement => ts.isInterfaceDeclaration(statement) && statement.name.text === name)
  const result = new Map()
  for (const clause of declaration.heritageClauses ?? []) {
    for (const base of clause.types) {
      for (const [name, contract] of properties(filename, base.expression.getText(source)))
        result.set(name, contract)
    }
  }
  for (const member of declaration.members)
    result.set(member.name.getText(source), { type: member.type.getText(source).replace(/\s/g, ''), optional: !!member.questionToken })
  return result
}
for (const name of ['NodeRendererProps']) {
  const expected = properties(path.join(repoRoot, 'src/types/node-renderer-props.ts'), name)
  const implemented = properties(path.join(packageRoot, 'src/types/node-renderer-props.ts'), name)
  for (const [property, contract] of expected) {
    const actual = implemented.get(property)
    assert.ok(actual, `Missing ${name}.${property}`)
    // Solid accepts readonly AST arrays and nullable signal values.
    if (property === 'nodes')
      assert.deepEqual(actual, { type: 'readonlyBaseNode[]|null', optional: true })
    else
      assert.deepEqual(actual, contract, `${name}.${property} contract differs`)
  }
}
for (const name of ['CodeBlockNodeProps', 'PreCodeNodeProps', 'MermaidBlockNodeProps', 'D2BlockNodeProps', 'InfographicBlockNodeProps', 'ImageNodeProps', 'LinkNodeProps', 'MathBlockNodeProps', 'MathInlineNodeProps']) {
  const expected = properties(path.join(repoRoot, 'src/types/component-props.ts'), name)
  const implemented = properties(path.join(packageRoot, 'src/types/component-props.ts'), name)
  for (const [property, contract] of expected)
    assert.deepEqual(implemented.get(property), contract, `${name}.${property} contract differs`)
}
console.log(`Vue 3 parity API: ${required.size} runtime exports and 10 inherited component/renderer property signatures passed; runtime behavior is checked separately`)
