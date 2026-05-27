import type { App } from 'vue'
import HeadingNode from './HeadingNode.vue'

type InstallableComponent<T> = T & {
  install?: (app: App) => void
}

const _HeadingNode = HeadingNode as InstallableComponent<typeof HeadingNode>

_HeadingNode.install = (app: App) => {
  app.component(HeadingNode.__name as string, HeadingNode)
}

export default _HeadingNode
