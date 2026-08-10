import type { AngularRenderableNode } from '../shared/node-helpers'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, Input } from '@angular/core'
import { getString, normalizeCodeLanguage } from '../shared/node-helpers'

function countCodeLines(code: string) {
  let count = 1
  for (let index = 0; index < code.length; index++) {
    if (code[index] === '\n') {
      count++
    }
    else if (code[index] === '\r') {
      count++
      if (code[index + 1] === '\n')
        index++
    }
  }
  return count
}

function getDisplayCode(code: unknown, loading?: boolean) {
  const value = getString(code)
  return loading ? value : value.replace(/\r\n$|\n$|\r$/, '')
}

@Component({
  selector: 'markstream-angular-pre-code-node',
  standalone: true,
  imports: [CommonModule],
  template: `<pre
    [ngClass]="preClasses"
    [ngStyle]="lineNumberLayoutStyle"
    [attr.aria-busy]="loading"
    [attr.aria-label]="ariaLabel"
    [attr.data-language]="language"
    [attr.data-markstream-line-numbers]="showLineNumbers ? '1' : null"
    data-markstream-pre="1"
    tabindex="0"
  ><ng-container *ngIf="showLineNumbers"><span class="markstream-pre__line-numbers" aria-hidden="true"><span class="markstream-pre__line-numbers-text">{{ lineNumbersText }}</span></span></ng-container><code translate="no" class="markstream-pre__code" [textContent]="displayCode"></code></pre>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PreCodeNodeComponent {
  @Input({ required: true }) node!: AngularRenderableNode
  @Input() showLineNumbers = false

  // ─── Line-count caching (mirrors the vue3 PreCodeNode) ─────────────────────
  private cachedCode = ''
  private cachedCount = 1
  private textCount = 0
  private textCache = ''

  get language() {
    return normalizeCodeLanguage((this.node as any)?.language)
  }

  get languageClass() {
    return `language-${this.language}`
  }

  get preClasses() {
    return {
      [this.languageClass]: true,
      'markstream-pre--line-numbers': this.showLineNumbers === true,
    }
  }

  get ariaLabel() {
    return this.language ? `Code block: ${this.language}` : 'Code block'
  }

  get code() {
    return getString((this.node as any)?.code)
  }

  get loading() {
    return (this.node as any)?.loading === true
  }

  get displayCode() {
    return getDisplayCode((this.node as any)?.code, this.loading)
  }

  get codeLineCount() {
    const code = this.displayCode
    if (code === this.cachedCode)
      return this.cachedCount
    this.cachedCount = countCodeLines(code)
    this.cachedCode = code
    return this.cachedCount
  }

  get lineNumbersText() {
    const count = this.codeLineCount
    if (count < this.textCount) {
      this.textCount = 0
      this.textCache = ''
    }
    for (let line = this.textCount + 1; line <= count; line++)
      this.textCache += `${this.textCache ? '\n' : ''}${line}`
    this.textCount = count
    return this.textCache
  }

  get lineNumberLayoutStyle(): Record<string, string> | null {
    if (this.showLineNumbers !== true)
      return null

    const maximumLineNumber = this.codeLineCount
    const width = `${Math.max(2, String(maximumLineNumber).length)}ch`
    return {
      '--markstream-pre-line-number-width': width,
      '--markstream-pre-diff-line-number-width': width,
      '--markstream-code-padding-left': 'calc(var(--markstream-pre-line-number-padding-left, 2ch) + var(--markstream-pre-line-number-width, 2ch) + var(--markstream-pre-line-number-padding-right, 1ch) + var(--markstream-pre-line-number-separator-width, 2px) + var(--markstream-pre-line-number-gap-to-code, 1ch))',
    }
  }
}
