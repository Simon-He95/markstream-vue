import type { App } from 'vue'
import HtmlInlineNode from './HtmlInlineNode.vue'

HtmlInlineNode.install = (app: App) => {
  app.component(HtmlInlineNode.__name as string, HtmlInlineNode)
}

export default HtmlInlineNode
