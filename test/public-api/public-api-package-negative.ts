// @ts-expect-error Declared subpaths must still reject unknown exports.
import { __missingUtilsExport } from 'markstream-vue/utils'

// @ts-expect-error Isolated utility subpaths must not expose renderer/root exports.
import { MarkdownRender as __unexpectedKatexThresholdRenderer } from 'markstream-vue/utils/katex-threshold'

// @ts-expect-error Declared worker subpaths must reject unknown and root-only exports.
import { __missingWorkerExport, MarkdownRender as __unexpectedWorkerRenderer } from 'markstream-vue/workers/katexWorkerClient'

void __missingUtilsExport
void __missingWorkerExport
void __unexpectedKatexThresholdRenderer
void __unexpectedWorkerRenderer
