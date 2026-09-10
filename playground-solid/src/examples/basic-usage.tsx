import { NodeRenderer } from 'markstream-solid'
import { PLAYGROUND_CUSTOM_HTML_TAGS, PLAYGROUND_CUSTOM_ID } from '../shared/markstreamPlayground'

export function SolidBasicUsage(props: { content: string, isDark?: boolean }) {
  return (
    <NodeRenderer
      content={props.content}
      isDark={props.isDark}
      customId={PLAYGROUND_CUSTOM_ID}
      customHtmlTags={PLAYGROUND_CUSTOM_HTML_TAGS}
      final
    />
  )
}
