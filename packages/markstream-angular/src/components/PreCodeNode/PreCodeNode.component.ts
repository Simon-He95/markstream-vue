import type { OnChanges } from '@angular/core'
import type { DiffPreviewCollapseOptions, DiffPreviewPane } from 'markstream-core'
import type { AngularRenderableNode } from '../shared/node-helpers'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, Input } from '@angular/core'
import { buildDiffPreviewPanes } from 'markstream-core'
import { getString, normalizeCodeLanguage } from '../shared/node-helpers'

@Component({
  selector: 'markstream-angular-pre-code-node',
  standalone: true,
  imports: [CommonModule],
  template: `
    <pre
      [class]="className"
      [class.code-pre-fallback]="showLineNumbers"
      [attr.aria-busy]="loading"
      [attr.aria-label]="ariaLabel"
      [attr.data-language]="language"
      [attr.data-markstream-line-numbers]="showLineNumbers ? '1' : null"
      tabindex="0"
    ><code *ngIf="isDiffPreview; else plainCode" translate="no" class="markstream-pre__diff-code"><span *ngFor="let pane of diffPanes; trackBy: trackPane" class="markstream-pre__diff-pane" [ngClass]="pane.className"><span class="markstream-pre__diff-pane-content"><span *ngFor="let line of pane.lines; trackBy: trackLine" class="markstream-pre__diff-line" [ngClass]="['markstream-pre__diff-line--' + line.kind, line.empty ? 'markstream-pre__diff-line--empty' : '']"><span class="markstream-pre__diff-rail" aria-hidden="true"></span><span class="markstream-pre__diff-number" aria-hidden="true">{{ line.number }}</span><span class="markstream-pre__diff-content"><span class="markstream-pre__diff-content-inner">{{ line.code }}</span></span></span></span></span></code><ng-template #plainCode><span *ngIf="showLineNumbers" class="markstream-pre__line-numbers" aria-hidden="true"><span class="markstream-pre__line-numbers-text">{{ lineNumbers }}</span></span><code translate="no" class="markstream-pre__code" [textContent]="code"></code></ng-template></pre>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PreCodeNodeComponent implements OnChanges {
  @Input({ required: true }) node!: AngularRenderableNode
  @Input() diffHideUnchangedRegions?: boolean | DiffPreviewCollapseOptions
  @Input() diffInline = false
  @Input() showLineNumbers = false

  code = ''
  diffPanes: DiffPreviewPane[] = []
  lineNumbers = ''

  get language() {
    return normalizeCodeLanguage((this.node as any)?.language)
  }

  get className() {
    return [
      `language-${this.language}`,
      this.showLineNumbers ? 'markstream-pre--line-numbers' : '',
      this.isDiffPreview ? 'markstream-pre--diff-preview' : '',
      this.isDiffPreview && this.diffInline ? 'markstream-pre--diff-inline' : '',
      this.diffPanes.some(pane => pane.lines.some(line => line.kind === 'collapsed')) ? 'markstream-pre--diff-collapsed' : '',
    ].filter(Boolean).join(' ')
  }

  get ariaLabel() {
    return this.language ? `Code block: ${this.language}` : 'Code block'
  }

  get loading() {
    return (this.node as any)?.loading === true
  }

  get isDiffPreview() {
    return this.showLineNumbers && (this.node as any)?.diff === true
  }

  ngOnChanges() {
    const value = getString((this.node as any)?.code)
    this.code = this.loading ? value : value.replace(/\r\n$|\n$|\r$/, '')
    this.lineNumbers = this.code.split(/\r\n|\n|\r/).map((_, index) => index + 1).join('\n')
    this.diffPanes = this.isDiffPreview
      ? buildDiffPreviewPanes({
          code: (this.node as any)?.code,
          hideUnchangedRegions: this.diffHideUnchangedRegions,
          inline: this.diffInline,
          language: (this.node as any)?.language,
          loading: this.loading,
          originalCode: (this.node as any)?.originalCode,
          raw: (this.node as any)?.raw,
          updatedCode: (this.node as any)?.updatedCode,
        })
      : []
  }

  trackPane(_: number, pane: DiffPreviewPane) {
    return pane.key
  }

  trackLine(_: number, line: DiffPreviewPane['lines'][number]) {
    return line.key
  }
}
