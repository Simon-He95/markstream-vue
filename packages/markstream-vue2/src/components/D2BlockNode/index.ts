import D2BlockNode from './D2BlockNode.vue'

interface Vue2App {
  component: (name: string, component: unknown) => void
}

D2BlockNode.install = (app: Vue2App) => {
  app.component(D2BlockNode.__name as string, D2BlockNode)
}

export default D2BlockNode
