<script lang="ts">
  import MarkdownRender from 'markstream-svelte'

  let {
    node,
    customId = undefined,
    isDark = false,
    typewriter = true,
  }: {
    node: any
    customId?: string
    isDark?: boolean
    typewriter?: boolean
  } = $props()
</script>

<section class="thinking-node">
  <header class="thinking-node__header">Thinking</header>
  <div class="thinking-node__body">
    <MarkdownRender
      content={String(node?.content ?? '')}
      {customId}
      {isDark}
      {typewriter}
      customHtmlTags={['thinking']}
      viewportPriority={false}
      deferNodesUntilVisible={false}
      batchRendering={false}
      maxLiveNodes={0}
    />
  </div>
</section>
