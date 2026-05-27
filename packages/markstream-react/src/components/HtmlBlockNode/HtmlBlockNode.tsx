import type { HtmlPolicy, ParsedNode } from 'stream-markdown-parser'
import type { CustomComponentMap } from '../../customComponents'
import type { NodeComponentProps } from '../../types/node-component'
import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { isHtmlTagBlocked, NON_STRUCTURING_HTML_TAGS, sanitizeHtmlContent, sanitizeHtmlTokenAttrs } from 'stream-markdown-parser'
import { useViewportPriority } from '../../context/viewportPriority'
import { getCustomComponentsRevision, getCustomNodeComponents, subscribeCustomComponents } from '../../customComponents'
import { renderNodeChildren, tokenAttrsToProps } from '../../renderers/renderChildren'
import { hasCustomHtmlComponents, normalizeDomAttrs, parseHtmlToReactNodes } from '../../utils/htmlToReact'

function mergeHtmlBlockClassName(attrs?: Record<string, any>) {
  const next = { ...(attrs || {}) }
  const existing = typeof next.className === 'string' ? next.className.trim() : ''
  next.className = existing ? `html-block-node ${existing}` : 'html-block-node'
  return next
}

export function HtmlBlockNode(props: NodeComponentProps<{
  type: 'html_block'
  content: string
  raw?: string
  tag?: string
  attrs?: [string, string | null][] | null
  children?: ParsedNode[]
  loading?: boolean
}> & {
  customComponents?: CustomComponentMap
  htmlPolicy?: HtmlPolicy
  placeholder?: React.ReactNode
}) {
  const { node, placeholder, customId } = props
  const htmlPolicy = props.htmlPolicy ?? props.ctx?.htmlPolicy ?? 'safe'
  const registerViewport = useViewportPriority()
  const [hostEl, setHostEl] = useState<HTMLElement | null>(null)
  const handleRef = useRef<ReturnType<typeof registerViewport> | null>(null)
  const [shouldRender, setShouldRender] = useState(() => typeof window === 'undefined')
  const [renderContent, setRenderContent] = useState(node.content)
  const isDeferred = Boolean(node.loading)

  const customComponentsRevision = useSyncExternalStore(
    subscribeCustomComponents,
    getCustomComponentsRevision,
    getCustomComponentsRevision,
  )

  const effectiveCustomComponents = useMemo(() => {
    // Allow explicit injection (primarily for tests), otherwise fall back to global store.
    return props.customComponents ?? getCustomNodeComponents(customId)
  }, [customId, props.customComponents, customComponentsRevision])

  useEffect(() => {
    if (typeof window === 'undefined') {
      setShouldRender(true)
      return
    }
    handleRef.current?.destroy()
    handleRef.current = null
    if (!isDeferred) {
      setShouldRender(true)
      setRenderContent(node.content)
      return
    }
    if (!hostEl) {
      setShouldRender(false)
      return
    }
    const handle = registerViewport(hostEl, { rootMargin: '400px' })
    handleRef.current = handle
    if (handle.isVisible())
      setShouldRender(true)
    handle.whenVisible.then(() => setShouldRender(true)).catch(() => {})
    return () => {
      handle.destroy()
      handleRef.current = null
    }
  }, [hostEl, isDeferred, node.content, registerViewport])

  useEffect(() => () => {
    handleRef.current?.destroy()
    handleRef.current = null
  }, [])

  useEffect(() => {
    if (!isDeferred || shouldRender)
      setRenderContent(node.content)
  }, [isDeferred, node.content, shouldRender])

  const boundAttrs = useMemo(() => {
    const rawAttrs = tokenAttrsToProps(sanitizeHtmlTokenAttrs(node.attrs ?? undefined, htmlPolicy))
    return rawAttrs ? normalizeDomAttrs(rawAttrs as Record<string, string>) : undefined
  }, [htmlPolicy, node.attrs])
  const structuredTag = useMemo(() => String(node.tag ?? '').trim(), [node.tag])
  const structuredBoundAttrs = useMemo(() => {
    const rawAttrs = tokenAttrsToProps(sanitizeHtmlTokenAttrs(node.attrs ?? undefined, htmlPolicy, structuredTag))
    return rawAttrs ? normalizeDomAttrs(rawAttrs as Record<string, string>) : undefined
  }, [htmlPolicy, node.attrs, structuredTag])
  const structuredChildren = useMemo(() => Array.isArray(node.children) ? node.children : [], [node.children])
  const isStructured = structuredChildren.length > 0
    && !!structuredTag
    && !NON_STRUCTURING_HTML_TAGS.has(structuredTag.toLowerCase())
    && !isHtmlTagBlocked(structuredTag, htmlPolicy)
    && !!props.ctx
    && !!props.renderNode
  const structuredWrapperProps = useMemo(
    () => mergeHtmlBlockClassName(structuredBoundAttrs as Record<string, any> | undefined),
    [structuredBoundAttrs],
  )

  // Check if we should use dynamic rendering
  const useDynamic = useMemo(() => {
    if (htmlPolicy === 'escape')
      return false
    return hasCustomHtmlComponents(node.content ?? '', effectiveCustomComponents)
  }, [effectiveCustomComponents, htmlPolicy, node.content])

  const reactNodes = useMemo(() => {
    if (!useDynamic || !node.content)
      return null
    return parseHtmlToReactNodes(node.content, effectiveCustomComponents, htmlPolicy)
  }, [effectiveCustomComponents, htmlPolicy, node.content, useDynamic])
  const safeHtmlContent = useMemo(() => sanitizeHtmlContent(renderContent ?? '', htmlPolicy), [htmlPolicy, renderContent])
  const structuredContent = useMemo(() => {
    if (!isStructured || !props.ctx || !props.renderNode)
      return null
    return renderNodeChildren(
      structuredChildren,
      props.ctx,
      `${String(props.indexKey ?? 'html-block')}-structured`,
      props.renderNode,
    )
  }, [isStructured, props.ctx, props.indexKey, props.renderNode, structuredChildren])

  const placeholderNode = (
    <div className="html-block-node__placeholder">
      {placeholder ?? (
        <>
          <span className="html-block-node__placeholder-bar" />
          <span className="html-block-node__placeholder-bar w-4/5" />
          <span className="html-block-node__placeholder-bar w-2/3" />
        </>
      )}
    </div>
  )

  if (isStructured) {
    return React.createElement(
      structuredTag,
      {
        ...(structuredWrapperProps as any),
        ref: setHostEl,
      },
      shouldRender ? structuredContent : placeholderNode,
    )
  }

  return (
    <div ref={setHostEl} className="html-block-node" {...(boundAttrs as any)}>
      {shouldRender
        ? (
            useDynamic && reactNodes
              ? (
                  <>{reactNodes}</>
                )
              : (
                  <div dangerouslySetInnerHTML={{ __html: safeHtmlContent }} />
                )
          )
        : placeholderNode}
    </div>
  )
}

export default HtmlBlockNode
