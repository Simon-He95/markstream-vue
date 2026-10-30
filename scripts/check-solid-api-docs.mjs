import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

const root = path.resolve(import.meta.dirname, '..')
const api = await import(pathToFileURL(path.join(root, 'packages/markstream-solid/dist/server/index.js')).href)
const declarations = new Map()
for (const file of ['src/types/component-props.ts', 'src/types/node-renderer-props.ts', 'src/components/NodeRenderer.tsx', 'src/customComponents.ts']) {
  const text = await readFile(path.join(root, 'packages/markstream-solid', file), 'utf8')
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true)
  for (const declaration of source.statements) {
    if (ts.isInterfaceDeclaration(declaration))
      declarations.set(declaration.name.text, declaration)
  }
}
function fields(name) {
  const declaration = declarations.get(name)
  return [...(declaration.heritageClauses ?? []).flatMap(clause => clause.types.flatMap(base => fields(base.expression.text))), ...declaration.members.map(member => member.name.text)]
}
for (const file of ['docs/guide/solid-api.md', 'docs/zh/guide/solid-api.md']) {
  const text = await readFile(path.join(root, file), 'utf8')
  const missing = Object.keys(api).filter(name => !text.includes(`| \`${name}\` |`))
  assert.deepEqual(missing, [], `${file} missing runtime API entries`)
  for (const section of ['MarkdownRenderProps', 'CodeBlockNodeProps', 'PreCodeNodeProps', 'MermaidBlockNodeProps', 'D2BlockNodeProps', 'InfographicBlockNodeProps', 'MathBlockNodeProps', 'MathInlineNodeProps', 'ImageNodeProps', 'LinkNodeProps', 'ReferenceNodeProps', 'MarkstreamVirtualTimelineProps', 'MarkstreamVirtualTimelineHandle'])
    assert.ok(text.includes(section), `${file} missing ${section}`)
  assert.ok(!text.includes('/Users/'), 'public docs cannot contain machine-local type paths')
  for (const contract of ['MarkdownRenderProps', 'NodeComponentProps', 'CodeBlockNodeProps', 'PreCodeNodeProps', 'MermaidBlockNodeProps', 'D2BlockNodeProps', 'InfographicBlockNodeProps', 'MathBlockNodeProps', 'MathInlineNodeProps', 'ImageNodeProps', 'LinkNodeProps', 'ReferenceNodeProps']) {
    const missingFields = fields(contract).filter(name => !text.includes(`| \`${name}\` |`))
    assert.deepEqual(missingFields, [], `${file} missing ${contract} property documentation`)
  }
}
console.log(`Solid component/API docs cover ${Object.keys(api).length} runtime exports in both languages`)
