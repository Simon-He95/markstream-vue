import type { NodeComponentProps } from '../../types/node-component'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useViewportPriority } from '../../context/viewportPriority'
import { tokenAttrsToProps } from '../../renderers/renderChildren'

export function HtmlBlockNode(props: NodeComponentProps<{
  type: 'html_block'
  content: string
  attrs?: [string, string | null][] | null
  loading?: boolean
}> & { placeholder?: React.ReactNode }) {
  const { node, placeholder } = props
  const registerViewport = useViewportPriority()
  const [hostEl, setHostEl] = useState<HTMLElement | null>(null)
  const handleRef = useRef<ReturnType<typeof registerViewport> | null>(null)
  const [shouldRender, setShouldRender] = useState(() => typeof window === 'undefined')
  const [renderContent, setRenderContent] = useState(node.content)
  const isDeferred = Boolean(node.loading)

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

  const boundAttrs = useMemo(() => tokenAttrsToProps(node.attrs ?? undefined), [node.attrs])

  return (
    <div ref={setHostEl} className="html-block-node" {...(boundAttrs as any)}>
      {shouldRender
        ? <div dangerouslySetInnerHTML={{ __html: renderContent ?? '' }} />
        : (
            <div className="html-block-node__placeholder">
              {placeholder ?? (
                <>
                  <span className="html-block-node__placeholder-bar" />
                  <span className="html-block-node__placeholder-bar w-4/5" />
                  <span className="html-block-node__placeholder-bar w-2/3" />
                </>
              )}
            </div>
          )}
    </div>
  )
}

export default HtmlBlockNode
