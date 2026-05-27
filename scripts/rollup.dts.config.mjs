import fs from 'node:fs'
import path from 'node:path'
import dts from 'rollup-plugin-dts'

const entryPoints = [
  {
    output: 'dist/index.d.ts',
    candidates: [
      './dist/types/exports.d.ts',
      './dist/types/src/exports.d.ts',
      './dist/index.d.ts',
    ],
  },
  {
    output: 'dist/utils/katex-threshold.d.ts',
    candidates: [
      './dist/types/src/entries/utils-katex-threshold.d.ts',
      './dist/types/entries/utils-katex-threshold.d.ts',
      './dist/utils/katex-threshold.d.ts',
    ],
  },
  {
    output: 'dist/utils/performance-monitor.d.ts',
    candidates: [
      './dist/types/src/entries/utils-performance-monitor.d.ts',
      './dist/types/entries/utils-performance-monitor.d.ts',
      './dist/utils/performance-monitor.d.ts',
    ],
  },
  {
    output: 'dist/utils/safeRaf.d.ts',
    candidates: [
      './dist/types/src/entries/utils-safeRaf.d.ts',
      './dist/types/entries/utils-safeRaf.d.ts',
      './dist/utils/safeRaf.d.ts',
    ],
  },
  {
    output: 'dist/workers/katexWorkerClient.d.ts',
    candidates: [
      './dist/types/src/entries/workers-katexWorkerClient.d.ts',
      './dist/types/entries/workers-katexWorkerClient.d.ts',
      './dist/workers/katexWorkerClient.d.ts',
    ],
  },
  {
    output: 'dist/workers/mermaidWorkerClient.d.ts',
    candidates: [
      './dist/types/src/entries/workers-mermaidWorkerClient.d.ts',
      './dist/types/entries/workers-mermaidWorkerClient.d.ts',
      './dist/workers/mermaidWorkerClient.d.ts',
    ],
  },
  {
    output: 'dist/workers/katexCdnWorker.d.ts',
    candidates: [
      './dist/types/src/entries/workers-katexCdnWorker.d.ts',
      './dist/types/entries/workers-katexCdnWorker.d.ts',
      './dist/workers/katexCdnWorker.d.ts',
    ],
  },
  {
    output: 'dist/workers/mermaidCdnWorker.d.ts',
    candidates: [
      './dist/types/src/entries/workers-mermaidCdnWorker.d.ts',
      './dist/types/entries/workers-mermaidCdnWorker.d.ts',
      './dist/workers/mermaidCdnWorker.d.ts',
    ],
  },
]

const configs = entryPoints.map(({ output, candidates }) => {
  const input = candidates.find(candidate => fs.existsSync(path.resolve(candidate)))

  if (!input) {
    throw new Error(
      `No declaration entry found for "${output}". Run \`pnpm run build\` before running \`build:dts\`.`,
    )
  }

  return {
    input,
    plugins: [
      dts({
        respectExternal: false,
      }),
    ],
    external: [
      /^stream-markdown-parser(?:\/.*)?$/,
      /^markstream-core(?:\/.*)?$/,
    ],
    output: [
      {
        file: output,
        format: 'es',
      },
    ],
  }
})

export default configs
