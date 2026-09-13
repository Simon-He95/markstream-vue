<script setup lang="ts">
import { computed } from 'vue'
import MarkdownRender from '../../../src/components/NodeRenderer'

const props = withDefaults(
  defineProps<{
    content: string
    isEnd?: boolean
  }>(),
  {
    isEnd: true,
  },
)

const isStreaming = computed(() => props.isEnd === false)
</script>

<template>
  <MarkdownRender
    custom-id="chat-message"
    :content="content"
    :final="!isStreaming"
    :smooth-streaming="isStreaming ? 'auto' : false"
    :fade="isStreaming"
    :typewriter="false"
    :max-live-nodes="isStreaming ? 0 : undefined"
    html-policy="safe"
    code-block-stream
  />
</template>
