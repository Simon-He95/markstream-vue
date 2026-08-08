const fs = require('node:fs')
const path = require('node:path')
const webpack = require('webpack')

function tryResolve(specifier) {
  try {
    return require.resolve(specifier)
  }
  catch {
    return null
  }
}

function resolveNodeModulesPackageRoot(pkgName) {
  // Some ESM-only packages cannot be resolved via `require.resolve(pkgName)` in
  // this CJS config file (no `require` entry + `exports` restrictions). Fall
  // back to checking `node_modules/<pkgName>` directly.
  const candidates = [
    path.join(__dirname, 'node_modules', pkgName),
    path.resolve(__dirname, '../node_modules', pkgName),
  ]
  for (const p of candidates) {
    try {
      if (fs.existsSync(p))
        return p
    }
    catch {}
  }
  return null
}

function resolvePackageRoot(pkgName) {
  const entry = tryResolve(pkgName)
  if (!entry)
    return null
  // `markstream-vue2` resolves to `<pkgRoot>/dist/index.cjs`
  return path.dirname(path.dirname(entry))
}

function resolveSiblingPackagePath(fromPkgRoot, siblingPkgName) {
  if (!fromPkgRoot)
    return null
  const candidate = path.join(path.dirname(fromPkgRoot), siblingPkgName)
  try {
    if (fs.existsSync(candidate))
      return candidate
  }
  catch {}
  return null
}

function setAliasIfResolved(alias, key, specifier) {
  const resolved = tryResolve(specifier)
  if (resolved)
    alias[key] = resolved
}

function setAliasIfExists(alias, key, filePath) {
  if (!filePath)
    return
  alias[key] = filePath
}

const markstreamVue2Root = resolvePackageRoot('markstream-vue2')
const markstreamCoreRoot = resolvePackageRoot('markstream-core') || resolveNodeModulesPackageRoot('markstream-core')
const floatingUiDomEntry = tryResolve('@floating-ui/dom')
const floatingUiDomRoot = resolvePackageRoot('@floating-ui/dom')
const floatingUiCoreRoot = resolveSiblingPackagePath(floatingUiDomRoot, 'core')
const floatingUiUtilsRoot = resolveSiblingPackagePath(floatingUiDomRoot, 'utils')

const alias = {}

function loadPlaygroundMarkdown() {
  const file = path.resolve(__dirname, '../playground/src/const/markdown.ts')
  try {
    const src = fs.readFileSync(file, 'utf8')
    const marker = 'export const streamContent = `'
    const start = src.indexOf(marker)
    if (start === -1)
      return ''
    const from = start + marker.length
    const end = src.lastIndexOf('`')
    if (end <= from)
      return ''

    // The source file is a TS template literal. We want the *runtime string*
    // value (i.e. decode common template escapes) without executing any code.
    // This is enough for our demo needs and avoids leaking double-escaped
    // delimiters like `\\[` (which breaks math parsing).
    const raw = src.slice(from, end)
    return raw
      // `\\` -> `\`
      .replace(/\\\\/g, '\\')
      // `\`` -> '`'
      .replace(/\\`/g, '`')
      // `\${` -> `${` (avoid template interpolation escapes being shown)
      .replace(/\\\$\{/g, '${')
  }
  catch {
    return ''
  }
}

// Important: ensure the entire app (including workspace-linked packages) uses a
// single Vue 2 runtime instance. Otherwise you will see Composition API warnings
// like "provide() can only be used inside setup()" due to duplicate Vue copies.
// Use the CJS runtime so CommonJS bundles (like markstream-vue2/dist/index.cjs)
// can access Vue static helpers (e.g. defineComponent) without ESM interop issues.
setAliasIfResolved(alias, 'vue$', 'vue/dist/vue.runtime.common.js')
// Force vue-demi into Vue 2 mode so defineComponent comes from @vue/composition-api.
setAliasIfResolved(alias, 'vue-demi$', 'vue-demi/lib/v2/index.cjs')

// Force Webpack 4 to use the CJS entry. The ESM entry (`dist/index.js`) is
// currently not compatible with Webpack 4 consumption in this playground.
setAliasIfExists(
  alias,
  'markstream-vue2$',
  markstreamVue2Root ? path.join(markstreamVue2Root, 'dist/index.cjs') : null,
)
setAliasIfExists(alias, 'markstream-core$', markstreamCoreRoot ? path.join(markstreamCoreRoot, 'dist/index.cjs') : null)

// Webpack 4 doesn't support `package.json#exports`, so subpath imports like
// `markstream-vue2/index.css` won't resolve. Map them to real files in `dist/`.
setAliasIfExists(alias, 'markstream-vue2/index.css', markstreamVue2Root ? path.join(markstreamVue2Root, 'dist/index.css') : null)
setAliasIfExists(alias, 'markstream-vue2/index.tailwind.css', markstreamVue2Root ? path.join(markstreamVue2Root, 'dist/index.tailwind.css') : null)
setAliasIfExists(alias, 'markstream-vue2/workers/katexRenderer.worker', markstreamVue2Root ? path.join(markstreamVue2Root, 'dist/workers/katexRenderer.worker.js') : null)
setAliasIfExists(alias, 'markstream-vue2/workers/mermaidParser.worker', markstreamVue2Root ? path.join(markstreamVue2Root, 'dist/workers/mermaidParser.worker.js') : null)

// Force Floating UI to CJS/UMD-compatible entries. Webpack 4 + pnpm otherwise
// follows the ESM build into symlinked package internals and misses peer deps.
setAliasIfExists(alias, '@floating-ui/dom$', floatingUiDomEntry)
setAliasIfExists(alias, '@floating-ui/core$', floatingUiCoreRoot ? path.join(floatingUiCoreRoot, 'dist/floating-ui.core.umd.js') : null)
setAliasIfExists(alias, '@floating-ui/utils$', floatingUiUtilsRoot ? path.join(floatingUiUtilsRoot, 'dist/floating-ui.utils.umd.js') : null)
setAliasIfExists(alias, '@floating-ui/utils/dom$', floatingUiUtilsRoot ? path.join(floatingUiUtilsRoot, 'dom/floating-ui.utils.dom.umd.js') : null)

// The CLI demo does not need the full D2 runtime. Use a tiny shim so the
// optional peer still degrades to source view instead of failing the build.
setAliasIfExists(alias, '@terrastruct/d2$', path.resolve(__dirname, 'shims/optional-d2.cjs'))

// Third-party packages that rely on `exports` subpaths (optional features).
setAliasIfResolved(alias, '@antv/infographic/jsx-runtime', '@antv/infographic/jsx-runtime')
setAliasIfResolved(alias, '@antv/infographic/jsx-dev-runtime', '@antv/infographic/jsx-dev-runtime')
setAliasIfResolved(alias, 'measury/fonts/AlibabaPuHuiTi-Regular', 'measury/fonts/AlibabaPuHuiTi-Regular')

function createOptionalIgnoreRegex() {
  const alwaysIgnore = [
    'mermaid',
    '@mermaid-js/parser',
    'langium',
    '@antv/infographic',
    '@antv/hierarchy',
  ]

  const combined = [...alwaysIgnore]
  return new RegExp(`^(${combined.join('|')})$`)
}

module.exports = {
  transpileDependencies: [
    'markstream-vue2',
    'stream-markdown-parser',
    '@antv/infographic',
  ],
  configureWebpack: {
    plugins: [
      new webpack.DefinePlugin({
        __MARKSTREAM_VUE2_CLI_DEMO_MD__: JSON.stringify(loadPlaygroundMarkdown()),
      }),
      // These are optional features. On Webpack 4 they may pull in `exports`-heavy
      // dependency graphs (AntV internals) that are hard to polyfill. Ignoring
      // them keeps the core renderer usable.
      new webpack.IgnorePlugin({
        resourceRegExp: createOptionalIgnoreRegex(),
      }),
    ],
    resolve: {
      // pnpm uses symlinks; this helps webpack 4 resolve dependencies correctly.
      symlinks: false,
      // Add workspace root `node_modules` for Webpack 4's resolver.
      modules: [
        'node_modules',
        path.resolve(__dirname, '../node_modules'),
      ],
      alias,
    },
  },
  chainWebpack: (config) => {
    // Avoid eagerly fetching hundreds of split chunks before the handoff page's
    // entry bundle can run. Async components still load their chunks on demand.
    config.plugins.delete('prefetch')
    // Avoid linting generated bundles / linked workspace packages in this playground.
    config.module.rules.delete('eslint')
  },
}
