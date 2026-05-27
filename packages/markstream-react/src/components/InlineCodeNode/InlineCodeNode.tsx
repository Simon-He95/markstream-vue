import type { NodeComponentProps } from '../../types/node-component'
import clsx from 'clsx'
import { resolveStreamingTextUpdate } from 'markstream-core'
import React, { useEffect, useRef, useState } from 'react'
import { useStreamStateRef } from '../../context/streamState'

export function InlineCodeNode(props: NodeComponentProps<{ type: 'inline_code', code: string }>) {
  const { node, children, ctx, indexKey, fade } = props
  const content = String(node.code ?? '')
  const fadeEnabled = fade ?? ctx?.fade ?? true
  const streamStateKey = indexKey == null || indexKey === ''
    ? ''
    : String(indexKey)
  const [settledContent, setSettledContent] = useState(content)
  const [streamedDelta, setStreamedDelta] = useState('')
  const [streamFadeVersion, setStreamFadeVersion] = useState(0)
  const streamStateRef = useStreamStateRef()
  const lastStreamRenderVersionRef = useRef<number | undefined>(undefined)
  const renderedContentRef = useRef({
    settledContent: content,
    streamedDelta: '',
  })

  const setRenderedContent = (nextSettledContent: string, nextStreamedDelta: string) => {
    renderedContentRef.current = {
      settledContent: nextSettledContent,
      streamedDelta: nextStreamedDelta,
    }
    setSettledContent(nextSettledContent)
    setStreamedDelta(nextStreamedDelta)
  }

  const getRenderedContent = () => {
    const { settledContent, streamedDelta } = renderedContentRef.current
    return settledContent + streamedDelta
  }

  useEffect(() => {
    const streamRenderVersion = streamStateRef?.getStreamRenderVersion() ?? ctx?.streamRenderVersion
    const streamRenderVersionChanged = streamRenderVersion !== lastStreamRenderVersionRef.current

    if (children != null) {
      setRenderedContent('', '')
      lastStreamRenderVersionRef.current = streamRenderVersion
      return
    }

    const textStreamState = streamStateRef?.textStreamState ?? ctx?.textStreamState
    const currentState = renderedContentRef.current
    const persistedContent = streamStateKey
      ? textStreamState?.get(streamStateKey)
      : undefined
    const nextState = resolveStreamingTextUpdate({
      nextContent: content,
      persistedContent,
      currentState,
      typewriterEnabled: fadeEnabled,
      streamRenderVersionChanged,
    })

    setRenderedContent(nextState.settledContent, nextState.streamedDelta)
    if (nextState.appended)
      setStreamFadeVersion(version => version + 1)
    if (streamStateKey)
      textStreamState?.set(streamStateKey, content)
    lastStreamRenderVersionRef.current = streamRenderVersion
  }, [children, content, streamStateRef, ctx?.textStreamState, ctx?.streamRenderVersion, streamStateKey, fadeEnabled])

  // Immediately settle when fade animations are disabled
  useEffect(() => {
    if (fadeEnabled)
      return
    const full = getRenderedContent()
    setRenderedContent(full, '')
  }, [fadeEnabled])

  const handleStreamedDeltaAnimationEnd = () => {
    if (!renderedContentRef.current.streamedDelta)
      return
    setRenderedContent(getRenderedContent(), '')
  }

  return (
    <code className="inline-code inline text-[85%] px-1 py-0.5 rounded font-mono bg-[hsl(var(--secondary))] whitespace-normal break-words max-w-full">
      {children || (
        <>
          {settledContent ? <span>{settledContent}</span> : null}
          {streamedDelta
            ? (
                <span
                  className={clsx(
                    'text-node-stream-delta',
                    streamFadeVersion % 2 === 0
                      ? 'text-node-stream-delta--a'
                      : 'text-node-stream-delta--b',
                  )}
                  onAnimationEnd={handleStreamedDeltaAnimationEnd}
                >
                  {streamedDelta}
                </span>
              )
            : null}
        </>
      )}
    </code>
  )
}

export default InlineCodeNode
