import { getMarkdown, parseMarkdownToStructure } from 'stream-markdown-parser'
import { describe, expect, it } from 'vitest'

function collectCodeBlocks(nodes: any[]): any[] {
  const result: any[] = []
  const visit = (node: any) => {
    if (!node || typeof node !== 'object')
      return
    if (node.type === 'code_block')
      result.push(node)

    if (Array.isArray(node.children))
      node.children.forEach(visit)
    if (Array.isArray(node.items))
      node.items.forEach(visit)
    // Some node types (table, list_item, etc.) contain nested arrays/objects.
    // Cover the common shapes used in this repo.
    if (node.header)
      visit(node.header)
    if (Array.isArray(node.rows))
      node.rows.forEach(visit)
    if (Array.isArray(node.cells))
      node.cells.forEach(visit)
    if (Array.isArray(node.term))
      node.term.forEach(visit)
    if (Array.isArray(node.definition))
      node.definition.forEach(visit)
  }

  nodes.forEach(visit)
  return result
}

describe('parseMarkdownToStructure - diff code block metadata', () => {
  it('preserves diff=true and language/file for `diff json:package.json` fence', () => {
    const md = getMarkdown('t')
    const markdown = [
      '2. Create the main Electron file:',
      '',
      '```javascript:electron/main.js',
      'const { app, BrowserWindow } = require(\'electron\');',
      'const path = require(\'path\');',
      'const isDev = process.env.NODE_ENV === \'development\';',
      '',
      'let mainWindow;',
      '',
      'function createWindow() {',
      '  mainWindow = new BrowserWindow({',
      '    width: 900,',
      '    height: 680,',
      '    webPreferences: {',
      '      nodeIntegration: true,',
      '      contextIsolation: false',
      '    }',
      '  });',
      '',
      '  const url = isDev',
      '    ? \'http://localhost:5173\'',
      '    : `file://' + '${' + 'path.join(__dirname, \'../dist/index.html\')' + '}`;',
      '',
      '  mainWindow.loadURL(url);',
      '',
      '  if (isDev) {',
      '    mainWindow.webContents.openDevTools();',
      '  }',
      '',
      '  mainWindow.on(\'closed\', () => {',
      '    mainWindow = null;',
      '  });',
      '}',
      '',
      'app.on(\'ready\', createWindow);',
      '',
      'app.on(\'window-all-closed\', () => {',
      '  if (process.platform !== \'darwin\') {',
      '    app.quit();',
      '  }',
      '});',
      '',
      'app.on(\'activate\', () => {',
      '  if (mainWindow === null) {',
      '    createWindow();',
      '  }',
      '});',
      '```',
      '',
      '3. Update package.json:',
      '',
      '```diff json:package.json',
      '{',
      '  "name": "markstream-vue",',
      '  "type": "module",',
      '- "version": "0.0.49",',
      '+ "version": "0.0.54-beta.1",',
      '  "packageManager": "pnpm@10.16.1",',
      '  "description": "A Vue 3 component that renders Markdown string content as HTML, supporting custom components and advanced markdown features.",',
      '  "author": "Simon He",',
      '  "license": "MIT",',
      '  "repository": {',
      '    "type": "git",',
      '    "url": "git + git@github.com:Simon-He95/markstream-vue.git"',
      '  },',
      '  "bugs": {',
      '    "url": "https://github.com/Simon-He95/markstream-vue/issues"',
      '  },',
      '  "keywords": [',
      '    "vue",',
      '    "vue3",',
      '    "markdown",',
      '    "markdown-to-html",',
      '    "markdown-renderer",',
      '    "vue-markdown",',
      '    "vue-component",',
      '    "html",',
      '    "renderer",',
      '    "custom-component"',
      '  ],',
      '  "exports": {',
      '    ".": {',
      '      "types": "./dist/types/exports.d.ts",',
      '      "import": "./dist/index.js",',
      '      "require": "./dist/index.cjs"',
      '    },',
      '    "./index.css": "./dist/index.css",',
      '    "./index.tailwind.css": "./dist/index.tailwind.css",',
      '    "./tailwind": {',
      '      "types": "./dist/tailwind.d.ts",',
      '      "import": "./dist/tailwind.js"',
      '    }',
      '  },',
      '  "main": "./dist/index.js",',
      '  "module": "./dist/index.js",',
      '  "types": "./dist/types/exports.d.ts",',
      '  "files": [',
      '    "dist"',
      '  ],',
      '}',
      '```',
    ].join('\n')

    const nodes = parseMarkdownToStructure(markdown, md)
    const blocks = collectCodeBlocks(nodes)
    expect(blocks.length).toBeGreaterThanOrEqual(2)

    const first = blocks[0]
    expect(first.language).toMatch(/^javascript(:|$)/)
    expect(String(first.language)).toContain(':electron/main.js')
    expect(!!first.diff).toBe(false)

    const second = blocks[1]
    expect(second.diff).toBe(true)
    // language should be parsed as the actual language (json) and keep the file hint.
    expect(String(second.language)).toMatch(/^json(:|$)/)
    expect(String(second.language)).toContain(':package.json')
  })
})
