import { NodeRenderer } from 'markstream-solid'
import { PLAYGROUND_CUSTOM_HTML_TAGS } from '../shared/markstreamPlayground'
import { PLAYGROUND_CUSTOM_COMPONENTS } from '../shared/playgroundComponents'

export function SolidCustomComponentsUsage(props: { content: string, isDark?: boolean }) {
  return (
    <NodeRenderer
      content={props.content}
      isDark={props.isDark}
      customComponents={PLAYGROUND_CUSTOM_COMPONENTS}
      customHtmlTags={PLAYGROUND_CUSTOM_HTML_TAGS}
      final
    />
  )
}
