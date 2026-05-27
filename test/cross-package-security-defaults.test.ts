import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
}

describe('cross-package security defaults', () => {
  it('keeps Mermaid strict by default across framework packages', () => {
    expect(source('packages/markstream-vue2/src/components/MermaidBlockNode/MermaidBlockNode.vue')).toContain('isStrict: true')
    expect(source('packages/markstream-react/src/components/MermaidBlockNode/MermaidBlockNode.tsx')).toContain('isStrict: true')
    expect(source('packages/markstream-angular/src/components/MermaidBlockNode/MermaidBlockNode.component.ts')).toContain('this.mergedProps.isStrict !== false')

    for (const path of [
      'packages/markstream-vue2/src/workers/mermaidParser.worker.ts',
      'packages/markstream-react/src/workers/mermaidParser.worker.ts',
      'packages/markstream-angular/src/workers/mermaidParser.worker.ts',
      'packages/markstream-vue2/src/workers/mermaidCdnWorker.ts',
      'packages/markstream-angular/src/workers/mermaidCdnWorker.ts',
    ]) {
      const workerSource = source(path)
      expect(workerSource).toContain('securityLevel: \'strict\'')
      expect(workerSource).toContain('htmlLabels: false')
    }
  })

  it('keeps Mermaid SVG mounting sanitized across loose-mode paths', () => {
    expect(source('packages/markstream-react/src/components/MermaidBlockNode/MermaidBlockNode.tsx')).toContain('const rendered = setSafeSvg(target, svg)')
    expect(source('packages/markstream-react/src/components/MermaidBlockNode/MermaidBlockNode.tsx')).not.toContain('target.insertAdjacentHTML(\'afterbegin\', svg)')
    expect(source('packages/markstream-vue2/src/components/MermaidBlockNode/MermaidBlockNode.vue')).toContain('const rendered = setSafeSvg(target, svg)')
    expect(source('packages/markstream-vue2/src/components/MermaidBlockNode/MermaidBlockNode.vue')).not.toContain('target.insertAdjacentHTML(\'afterbegin\', svg)')
    expect(source('packages/markstream-svelte/src/components/MermaidBlockNode.svelte')).toContain('toSafeMermaidSvgMarkup(rawSvg)')
    expect(source('packages/markstream-angular/src/enhanceRenderedHtml.ts')).toContain('toSafeMermaidSvgMarkup(svg)')
    expect(source('packages/markstream-svelte/src/enhanceRenderedHtml.ts')).toContain('toSafeMermaidSvgMarkup(svg)')
  })

  it('gates Mermaid bindFunctions across component and static enhancer paths', () => {
    expect(source('src/components/MermaidBlockNode/MermaidBlockNode.vue')).toContain('bindMermaidInteractions(clone)')
    expect(source('packages/markstream-vue2/src/components/MermaidBlockNode/MermaidBlockNode.vue')).toContain('bindMermaidInteractions(clone)')
    const reactMermaidSource = source('packages/markstream-react/src/components/MermaidBlockNode/MermaidBlockNode.tsx')
    expect(reactMermaidSource).toContain('function bindMermaidInteractionsTo')
    expect(reactMermaidSource).toContain('host,')
    expect(source('packages/markstream-vue2/src/components/MermaidBlockNode/MermaidBlockNode.vue')).toContain('!props.enableMermaidInteractions')
    const angularMermaidSource = source('packages/markstream-angular/src/components/MermaidBlockNode/MermaidBlockNode.component.ts')
    expect(angularMermaidSource).toContain('this.mergedProps.enableMermaidInteractions !== true')
    expect(angularMermaidSource).toContain('private lastMermaidBindFunctions')
    expect(angularMermaidSource).toContain('this.bindMermaidInteractions(this.modalHost?.nativeElement)')
    expect(source('packages/markstream-angular/src/enhanceRenderedHtml.ts')).toContain('options.mermaidProps?.enableMermaidInteractions === true')
    const svelteMermaidSource = source('packages/markstream-svelte/src/components/MermaidBlockNode.svelte')
    expect(svelteMermaidSource).toContain('if (enableMermaidInteractions')
    expect(svelteMermaidSource).toContain('bind:this={modalHost}')
    expect(source('packages/markstream-svelte/src/enhanceRenderedHtml.ts')).toContain('options.mermaidProps?.enableMermaidInteractions === true')
  })

  it('defaults HTML preview sandboxes to least privilege across framework packages', () => {
    expect(source('src/components/CodeBlockNode/HtmlPreviewFrame.vue')).toContain(':sandbox="sandboxValue"')
    expect(source('packages/markstream-vue2/src/components/CodeBlockNode/HtmlPreviewFrame.vue')).toContain(':sandbox="sandboxValue"')
    expect(source('packages/markstream-react/src/components/CodeBlockNode/HtmlPreviewFrame.tsx')).toContain('sandbox={sandboxValue}')
    expect(source('packages/markstream-angular/src/components/CodeBlockNode/HtmlPreviewFrame.component.ts')).toContain('[attr.sandbox]="sandboxValue"')
    expect(source('src/components/CodeBlockNode/HtmlPreviewFrame.vue')).toContain('referrerpolicy="no-referrer"')
    expect(source('packages/markstream-vue2/src/components/CodeBlockNode/HtmlPreviewFrame.vue')).toContain('referrerpolicy="no-referrer"')
    expect(source('packages/markstream-react/src/components/CodeBlockNode/HtmlPreviewFrame.tsx')).toContain('referrerPolicy="no-referrer"')
    expect(source('packages/markstream-angular/src/components/CodeBlockNode/HtmlPreviewFrame.component.ts')).toContain('referrerpolicy="no-referrer"')
    expect(source('src/components/CodeBlockNode/HtmlPreviewFrame.vue')).toContain('referrerpolicy="no-referrer"')
    expect(source('packages/markstream-vue2/src/components/CodeBlockNode/HtmlPreviewFrame.vue')).toContain('referrerpolicy="no-referrer"')
    expect(source('packages/markstream-react/src/components/CodeBlockNode/HtmlPreviewFrame.tsx')).toContain('referrerPolicy="no-referrer"')
    expect(source('packages/markstream-angular/src/components/CodeBlockNode/HtmlPreviewFrame.component.ts')).toContain('referrerpolicy="no-referrer"')
    expect(source('src/components/CodeBlockNode/CodeBlockNode.vue')).toContain(':html-preview-allow-scripts="props.htmlPreviewAllowScripts"')
    expect(source('packages/markstream-vue2/src/components/CodeBlockNode/CodeBlockNode.vue')).toContain(':html-preview-allow-scripts="props.htmlPreviewAllowScripts"')
    expect(source('packages/markstream-react/src/components/CodeBlockNode/CodeBlockNode.tsx')).toContain('htmlPreviewAllowScripts={props.htmlPreviewAllowScripts}')
    expect(source('packages/markstream-angular/src/components/CodeBlockNode/CodeBlockNode.component.ts')).toContain('[htmlPreviewAllowScripts]="mergedProps.htmlPreviewAllowScripts === true"')

    for (const path of [
      'src/components/CodeBlockNode/HtmlPreviewFrame.vue',
      'packages/markstream-vue2/src/components/CodeBlockNode/HtmlPreviewFrame.vue',
      'packages/markstream-react/src/components/CodeBlockNode/HtmlPreviewFrame.tsx',
      'packages/markstream-angular/src/components/CodeBlockNode/HtmlPreviewFrame.component.ts',
    ]) {
      expect(source(path)).toContain('typeof htmlPreviewSandbox === \'string\'')
      expect(source(path)).toContain('allow-scripts and allow-same-origin')
      expect(source(path)).not.toContain('allow-scripts allow-same-origin')
    }
  })
})
