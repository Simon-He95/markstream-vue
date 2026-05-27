import type { App } from 'vue'
import NodeRenderer from './NodeRenderer.vue'

type InstallableComponent<T> = T & {
  install?: (app: App) => void
  __name?: string
  name?: string
}

const _NodeRenderer = NodeRenderer as InstallableComponent<typeof NodeRenderer>

_NodeRenderer.install = (app: App) => {
  const compName = _NodeRenderer.__name ?? _NodeRenderer.name ?? 'NodeRenderer'
  app.component(compName as string, NodeRenderer)
}

export default _NodeRenderer
