import {
  getLanguageIcon,
  isBrokenMermaidSvg,
  normalizeLanguageIdentifier,
  parseMarkdownToStructure,
  safeRaf,
  sanitizeMermaidSvg,
  toSafeMermaidSvgMarkup,
  toSafeSvgElement,
} from 'markstream-vue/utils'
import {
  recommendWorkerThreshold,
} from 'markstream-vue/utils/katex-threshold'
import {
  disablePerfMonitoring,
  enablePerfMonitoring,
  getPerfReport,
} from 'markstream-vue/utils/performance-monitor'
import {
  safeCancelRaf,
} from 'markstream-vue/utils/safeRaf'
import {
  createKaTeXWorkerFromCDN,
} from 'markstream-vue/workers/katexCdnWorker'
import {
  renderKaTeXInWorker,
} from 'markstream-vue/workers/katexWorkerClient'
import {
  createMermaidWorkerFromCDN,
} from 'markstream-vue/workers/mermaidCdnWorker'
import {
  findPrefixOffthread,
} from 'markstream-vue/workers/mermaidWorkerClient'

void safeRaf
void safeCancelRaf
void getLanguageIcon
void normalizeLanguageIdentifier
void parseMarkdownToStructure
void sanitizeMermaidSvg
void toSafeMermaidSvgMarkup
void toSafeSvgElement
void isBrokenMermaidSvg
void safeRaf
void recommendWorkerThreshold
void enablePerfMonitoring
void disablePerfMonitoring
void getPerfReport
void createKaTeXWorkerFromCDN
void renderKaTeXInWorker
void createMermaidWorkerFromCDN
void findPrefixOffthread
