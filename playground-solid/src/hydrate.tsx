import MarkdownRender from 'markstream-solid'
import { createSignal } from 'solid-js'
import { hydrate } from 'solid-js/web'

const initial = Array.from({ length: 100 }, (_, index) => `Paragraph ${index}`).join('\n\n')
const [content, setContent] = createSignal(initial)
hydrate(() => <MarkdownRender content={content()} final renderCodeBlocksAsPre smoothStreaming={true} maxLiveNodes={0} />, document.getElementById('root')!)
Object.assign(window, { __solidHydrate: { append: () => setContent(`${initial}\n\nHydrated tail`) } })
