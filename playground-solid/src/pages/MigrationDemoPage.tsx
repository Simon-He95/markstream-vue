import { NodeRenderer } from 'markstream-solid'
import { Icon } from '../components/Icon'
import basicUsageSource from '../examples/basic-usage.tsx?raw'
import controllerUsageSource from '../examples/controller-usage.tsx?raw'
import customComponentsUsageSource from '../examples/custom-components-usage.tsx?raw'
import workerUsageSource from '../examples/worker-usage.tsx?raw'
import { PLAYGROUND_CUSTOM_HTML_TAGS, PLAYGROUND_CUSTOM_ID } from '../shared/markstreamPlayground'

interface MigrationDemoPageProps {
  isDark: boolean
  onGoHome: () => void
  onGoTest: () => void
}

function CodePanel(props: { badge: string, title: string, description: string, code: string, lang?: string }) {
  return (
    <section class="rounded-2xl border border-slate-200 bg-white shadow-lg shadow-slate-200/40 dark:border-slate-700 dark:bg-slate-900 dark:shadow-black/20 overflow-hidden">
      <div class="border-b border-slate-200 bg-slate-50 px-5 py-4 dark:border-slate-700 dark:bg-slate-800/80">
        <div class="flex items-center justify-between gap-3">
          <div>
            <div class="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
              {props.badge}
            </div>
            <h2 class="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">
              {props.title}
            </h2>
          </div>
          <div class="rounded-full bg-slate-200 px-3 py-1 text-xs font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300">
            {props.lang ?? 'TSX'}
          </div>
        </div>
        <p class="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
          {props.description}
        </p>
      </div>
      <pre class="overflow-x-auto bg-slate-950 px-5 py-4 text-[13px] leading-6 text-slate-100">
        <code>{props.code}</code>
      </pre>
    </section>
  )
}

const REACT_ONLY_NOTE = `// React-only. This playground does not provide a react-markdown compatibility layer.
// See playground-react18 /migration-demo for the react-markdown skill fixtures.
import Markdown from 'react-markdown'
export function Before() {
  return <Markdown>{\`# Hello\`}</Markdown>
}
`

const SOLID_LIVE_MARKDOWN = `# Solid usage

This page shows **typecheckable** \`markstream-solid\` call sites:

- \`NodeRenderer\` + \`content\`
- \`useSmoothMarkdownStream\` accessors
- scoped \`setCustomComponents\`
- Worker injection on an app owner

\`render-window\` is **not** virtualization in this renderer.
`

export function MigrationDemoPage(props: MigrationDemoPageProps) {
  return (
    <div class="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.18),_transparent_38%),linear-gradient(180deg,_#f8fafc_0%,_#eef2ff_48%,_#ffffff_100%)] dark:bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.16),_transparent_32%),linear-gradient(180deg,_#0f172a_0%,_#111827_48%,_#020617_100%)]" data-migration-demo>
      <div class="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div class="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-2xl shadow-slate-300/40 backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/88 dark:shadow-black/30">
          <div class="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200/80 pb-6 dark:border-slate-700/80">
            <div class="max-w-3xl">
              <div class="inline-flex items-center gap-2 rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-sky-700 dark:bg-sky-500/15 dark:text-sky-300">
                <Icon icon="carbon:skill-level-basic" class="h-4 w-4" />
                Solid usage
              </div>
              <h1 class="mt-4 text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-50 sm:text-4xl">
                markstream-solid integration
              </h1>
              <p class="mt-4 max-w-2xl text-sm leading-7 text-slate-600 dark:text-slate-300 sm:text-base">
                These snippets are real playground modules that typecheck against
                {' '}
                <code>markstream-solid</code>
                . Controller accessors, component registration, and Worker config are shown below. The historical
                {' '}
                <code>react-markdown</code>
                {' '}
                skill cases stay labeled React-only.
              </p>
            </div>
            <div class="flex flex-wrap gap-2">
              <button type="button" class="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200" onClick={props.onGoHome}>
                <Icon icon="carbon:home" class="h-4 w-4" />
                Home
              </button>
              <button type="button" class="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200" onClick={props.onGoTest}>
                <Icon icon="carbon:rocket" class="h-4 w-4" />
                Test Lab
              </button>
            </div>
          </div>

          <div class="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.95fr)]">
            <section class="space-y-6">
              <div class="grid gap-6 xl:grid-cols-2">
                <CodePanel
                  badge="Solid"
                  title="Basic call site"
                  description="Swap in NodeRenderer, import CSS, pass Markdown through content."
                  code={basicUsageSource}
                />
                <CodePanel
                  badge="Solid"
                  title="Controller accessors"
                  description="useSmoothMarkdownStream exposes source(), visible(), pendingChars(), caughtUp(), final(). Duplicate renderer smoothing is off."
                  code={controllerUsageSource}
                />
              </div>
              <div class="grid gap-6 xl:grid-cols-2">
                <CodePanel
                  badge="Solid"
                  title="Component registration"
                  description="Scoped setCustomComponents plus ThinkingNode nested Markdown."
                  code={customComponentsUsageSource}
                />
                <CodePanel
                  badge="Solid"
                  title="Worker config"
                  description="App-owner injection. Vite ?worker imports live in src/workers.ts so a child unmount cannot terminate shared workers."
                  code={workerUsageSource}
                />
              </div>
              <CodePanel
                badge="React-only"
                title="react-markdown skill fixture"
                description="Kept for navigation parity. This is not a Solid migration tool and is not claimed to run here."
                code={REACT_ONLY_NOTE}
                lang="React"
              />
            </section>

            <aside class="rounded-2xl border border-slate-200 bg-white shadow-lg shadow-slate-200/40 dark:border-slate-700 dark:bg-slate-900 dark:shadow-black/20 overflow-hidden">
              <div class="border-b border-slate-200 bg-gradient-to-r from-amber-50 to-cyan-50 px-5 py-4 dark:border-slate-700 dark:from-amber-500/10 dark:to-cyan-500/10">
                <div class="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                  Live Solid render
                </div>
                <h2 class="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">
                  Typechecked usage
                </h2>
                <p class="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
                  Same NodeRenderer the snippets import, with custom tags enabled.
                </p>
              </div>
              <div class="max-h-[1120px] overflow-y-auto px-5 py-5" data-migration-live>
                <NodeRenderer
                  content={SOLID_LIVE_MARKDOWN}
                  isDark={props.isDark}
                  customId={PLAYGROUND_CUSTOM_ID}
                  customHtmlTags={PLAYGROUND_CUSTOM_HTML_TAGS}
                  renderCodeBlocksAsPre
                  viewportPriority={false}
                  deferNodesUntilVisible={false}
                  maxLiveNodes={0}
                />
              </div>
            </aside>
          </div>
        </div>
      </div>
    </div>
  )
}
