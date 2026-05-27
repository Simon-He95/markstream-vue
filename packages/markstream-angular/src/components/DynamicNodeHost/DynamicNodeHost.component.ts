import type { ComponentRef, OnChanges, OnDestroy, SimpleChanges, Type } from '@angular/core'
import type { AngularRenderableNode, AngularRenderContext } from '../shared/node-helpers'
import {
  ChangeDetectionStrategy,
  Component,
  Input,
  ViewChild,
  ViewContainerRef,
} from '@angular/core'

@Component({
  selector: 'markstream-angular-dynamic-node-host',
  standalone: true,
  template: '<ng-template #container></ng-template>',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DynamicNodeHostComponent implements OnChanges, OnDestroy {
  @Input() component?: Type<any> | null
  @Input({ required: true }) node!: AngularRenderableNode
  @Input() context?: AngularRenderContext
  @Input() indexKey?: string
  @Input() inputs?: Record<string, unknown> | null

  @ViewChild('container', { read: ViewContainerRef, static: true })
  private containerRef?: ViewContainerRef

  private componentRef: ComponentRef<any> | null = null

  ngOnChanges(changes: SimpleChanges) {
    if (!this.containerRef)
      return

    if (changes.component)
      this.mountComponent()

    this.applyInputs()
  }

  ngOnDestroy() {
    this.componentRef?.destroy()
    this.componentRef = null
  }

  private mountComponent() {
    this.containerRef?.clear()
    this.componentRef?.destroy()
    this.componentRef = null

    if (!this.component || !this.containerRef)
      return

    this.componentRef = this.containerRef.createComponent(this.component)
  }

  private applyInputs() {
    const componentRef = this.componentRef
    const instance = componentRef?.instance
    if (!instance || !componentRef)
      return

    const setValue = (key: string, value: unknown) => {
      if (this.hasDeclaredInput(componentRef, key)) {
        try {
          componentRef.setInput(key, value)
        }
        catch {
          // Fall back to direct instance assignment for edge-case compiled components.
        }
      }

      instance[key] = value
    }

    setValue('node', this.node)
    setValue('nodes', Array.isArray((this.node as any)?.children) ? (this.node as any).children : undefined)
    setValue('content', typeof (this.node as any)?.content === 'string' ? (this.node as any).content : undefined)
    setValue('loading', (this.node as any)?.loading)
    setValue('final', typeof (this.node as any)?.loading === 'boolean' ? !(this.node as any).loading : this.context?.final)
    setValue('context', this.context)
    setValue('ctx', this.context)
    setValue('customId', this.context?.customId)
    setValue('customHtmlTags', this.context?.customHtmlTags)
    setValue('parseOptions', this.context?.parseOptions)
    setValue('customMarkdownIt', this.context?.customMarkdownIt)
    setValue('isDark', this.context?.isDark)
    setValue('indexKey', this.indexKey)
    setValue('typewriter', this.context?.typewriter)
    setValue('fade', this.context?.fade)
    setValue('showTooltips', this.context?.showTooltips)
    setValue('codeBlockStream', this.context?.codeBlockStream)
    setValue('renderCodeBlocksAsPre', this.context?.renderCodeBlocksAsPre)
    setValue('codeBlockProps', this.context?.codeBlockProps)
    setValue('mermaidProps', this.context?.mermaidProps)
    setValue('d2Props', this.context?.d2Props)
    setValue('infographicProps', this.context?.infographicProps)

    if (this.inputs) {
      for (const [key, value] of Object.entries(this.inputs))
        setValue(key, value)
    }

    componentRef.changeDetectorRef.detectChanges()
  }

  private hasDeclaredInput(componentRef: ComponentRef<any>, key: string) {
    const inputMap = (componentRef.componentType as any)?.ɵcmp?.inputs
    if (!inputMap || typeof inputMap !== 'object')
      return false

    if (key in inputMap)
      return true

    return Object.values(inputMap).includes(key)
  }
}
