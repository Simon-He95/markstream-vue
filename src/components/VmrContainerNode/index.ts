import type { App } from 'vue'
import VmrContainerNode from './VmrContainerNode.vue'

VmrContainerNode.install = (app: App) => {
  app.component(VmrContainerNode.__name as string, VmrContainerNode)
}

export default VmrContainerNode
