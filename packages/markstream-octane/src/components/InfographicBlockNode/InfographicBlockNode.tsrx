import type { VisibilityHandle } from '../../context/viewportPriority.tsrx'
import type { InfographicBlockNodeProps, MermaidBlockEvent } from '../../types/component-props'
import clsx from 'clsx'
import * as Octane from 'octane'
import { useCallback, useEffect, useMemo, useRef, useState } from 'octane'
import { createPortal } from 'octane'
import { createPanGesture } from 'markstream-core'
import type { PanGesture } from 'markstream-core'
import { useViewportPriority } from '../../context/viewportPriority.tsrx'
import { useSafeI18n } from '../../i18n/useSafeI18n'
import { hideTooltip, showTooltipForAnchor } from '../../tooltip/singletonTooltip'
import { clampInfographicPreviewHeight, estimateInfographicPreviewHeight, parsePositiveNumber } from './height'
import { getInfographic } from './infographic'

// Inline Icon
const INFOGRAPHIC_ICON = (
  <svg width="1em" height="1em" viewBox="0 0 291 300" fill="none" className="w-4 h-4 flex-shrink-0" xmlns="http://www.w3.org/2000/svg">
    <g>
      <path d="M140.904 239.376C128.83 239.683 119.675 239.299 115.448 243.843C110.902 248.07 111.288 257.227 110.979 269.302C111.118 274.675 111.118 279.478 111.472 283.52C111.662 285.638 111.95 287.547 112.406 289.224C112.411 289.243 112.416 289.259 112.422 289.28C112.462 289.419 112.496 289.558 112.539 289.691C113.168 291.787 114.088 293.491 115.446 294.758C116.662 296.064 118.283 296.963 120.264 297.69C120.36 297.614 120.464 297.646 120.555 297.675C120.56 297.68 120.56 297.68 120.566 297.68C120.848 297.768 121.142 297.846 121.443 297.923C121.454 297.923 121.464 297.928 121.478 297.934C122.875 298.272 124.424 298.507 126.11 298.678C126.326 298.696 126.542 298.718 126.763 298.739C130.79 299.086 135.558 299.088 140.904 299.222C152.974 298.912 162.128 299.302 166.36 294.758C170.904 290.526 170.515 281.371 170.824 269.302C170.515 257.227 170.907 248.07 166.36 243.843C162.131 239.299 152.974 239.683 140.904 239.376Z" fill="#FF6376"></path>
      <path d="M21.2155 128.398C12.6555 128.616 6.16484 128.339 3.16751 131.56C-0.0538222 134.56 0.218178 141.054 -0.000488281 149.608C0.218178 158.168 -0.0538222 164.659 3.16751 167.656C6.16484 170.878 12.6555 170.606 21.2155 170.824C25.0262 170.726 28.4288 170.726 31.2955 170.475C32.7968 170.342 34.1488 170.136 35.3382 169.814C35.3542 169.811 35.3648 169.806 35.3782 169.803C35.4768 169.774 35.5755 169.747 35.6688 169.718C37.1568 169.272 38.3648 168.622 39.2635 167.656C40.1915 166.795 40.8262 165.646 41.2715 164.243C41.2875 164.174 41.3115 164.102 41.3328 164.035C41.3328 164.035 41.3355 164.032 41.3355 164.027C41.3968 163.827 41.4529 163.622 41.5062 163.406C41.5062 163.398 41.5115 163.392 41.5142 163.382C41.7542 162.392 41.9222 161.294 42.0422 160.096C42.0555 159.944 42.0715 159.792 42.0848 159.635C42.3328 156.779 42.3328 153.398 42.4262 149.608C42.2075 141.054 42.4848 134.56 39.2635 131.56C36.2635 128.339 29.7728 128.616 21.2155 128.398Z" fill="#FFCCCC"></path>
      <path d="M81.0595 184.171C70.8568 184.433 63.1208 184.102 59.5475 187.942C55.7075 191.518 56.0328 199.254 55.7742 209.454C56.0328 219.657 55.7075 227.393 59.5475 230.963C63.1208 234.803 70.8568 234.478 81.0595 234.739C85.6008 234.622 89.6595 234.622 93.0728 234.323C94.8648 234.163 96.4755 233.921 97.8942 233.534C97.9102 233.529 97.9235 233.526 97.9422 233.521C98.0568 233.486 98.1742 233.457 98.2888 233.422C100.06 232.889 101.5 232.113 102.569 230.963C103.676 229.937 104.433 228.566 104.964 226.894C104.985 226.811 105.012 226.726 105.036 226.646C105.041 226.643 105.041 226.643 105.041 226.638C105.116 226.401 105.18 226.153 105.244 225.897C105.244 225.889 105.249 225.881 105.254 225.867C105.54 224.689 105.74 223.379 105.881 221.953C105.9 221.771 105.916 221.59 105.934 221.403C106.228 218.001 106.228 213.969 106.342 209.454C106.081 199.254 106.412 191.518 102.572 187.942C98.9955 184.102 91.2568 184.433 81.0595 184.171Z" fill="#FF939F"></path>
      <path d="M260.591 151.87C215.652 151.87 203.02 164.523 203.02 209.462H198.476C198.476 164.523 185.836 151.881 140.895 151.881V147.337C185.836 147.337 198.487 134.705 198.487 89.7659H203.02C203.02 134.705 215.652 147.337 260.591 147.337V151.87ZM286.052 124.158C281.82 119.614 272.66 120.001 260.591 119.689C248.521 119.385 239.361 119.771 235.129 115.227C230.585 110.995 230.983 101.846 230.671 89.7659C230.513 83.7312 230.535 78.4272 230.023 74.1019C229.513 69.7659 228.481 66.4219 226.209 64.3046C221.967 59.7606 212.817 60.1472 200.748 59.8459C188.681 60.1472 179.519 59.7606 175.287 64.3046C170.753 68.5366 171.129 77.6966 170.828 89.7659C170.516 101.835 170.9 110.995 166.356 115.227C162.124 119.771 152.985 119.374 140.905 119.689C138.873 119.739 136.924 119.771 135.071 119.811C119.313 118.697 106.337 112.318 106.337 89.7659C106.212 84.6699 106.233 80.1792 105.807 76.5206C105.367 72.8726 104.492 70.0379 102.575 68.2566C99.0013 64.4112 91.2573 64.7446 81.0653 64.4832C70.86 64.7446 63.1186 64.4112 59.5533 68.2566C55.708 71.8299 56.0306 79.5632 55.7693 89.7659C56.0306 99.9686 55.708 107.702 59.5533 111.278C63.1186 115.113 70.86 114.79 81.0653 115.049C103.617 115.049 109.996 128.035 111.1 143.803C111.068 145.659 111.028 147.587 110.975 149.619C111.121 154.987 111.121 159.79 111.476 163.835C111.663 165.95 111.945 167.857 112.404 169.534C112.412 169.555 112.412 169.566 112.423 169.598C112.465 169.734 112.497 169.867 112.537 170.003C113.164 172.099 114.092 173.809 115.447 175.07C116.665 176.371 118.281 177.278 120.271 177.905C120.364 177.934 120.46 177.955 120.564 177.987C120.855 178.081 121.145 178.153 121.439 178.238C121.46 178.238 121.471 178.238 121.479 178.249C122.876 178.582 124.42 178.822 126.108 178.987C126.327 179.009 126.545 179.03 126.764 179.051C130.788 179.395 135.559 179.395 140.905 179.529C152.975 179.843 162.124 179.457 166.356 184.001C170.9 188.233 170.516 197.371 170.828 209.451C171.129 221.529 170.743 230.681 175.287 234.91C179.519 239.454 188.681 239.07 200.748 239.371C206.127 239.235 210.921 239.235 214.975 238.881C217.079 238.694 218.985 238.403 220.676 237.955C220.695 237.945 220.705 237.934 220.727 237.934C220.873 237.891 220.999 237.859 221.135 237.819C223.228 237.193 224.937 236.265 226.209 234.91C227.511 233.691 228.409 232.065 229.044 230.097C229.065 230.003 229.095 229.899 229.127 229.803V229.793C229.22 229.513 229.295 229.222 229.367 228.918C229.367 228.897 229.377 228.897 229.377 228.878C229.721 227.481 229.951 225.937 230.127 224.249C230.137 224.03 230.169 223.811 230.191 223.593C230.535 219.571 230.535 214.798 230.671 209.451C230.972 197.371 230.585 188.233 235.129 184.001C239.361 179.457 248.511 179.843 260.591 179.529C272.66 179.227 281.82 179.614 286.052 175.07C290.596 170.838 290.209 161.689 290.511 149.619C290.209 137.539 290.596 128.379 286.052 124.158Z" fill="#FF356A"></path>
      <path d="M112.405 49.848C112.411 49.8694 112.416 49.8827 112.421 49.904C112.461 50.0427 112.499 50.1814 112.539 50.3147C113.171 52.4134 114.088 54.1147 115.448 55.384C116.661 56.6907 118.283 57.5894 120.264 58.2134C120.36 58.24 120.464 58.2694 120.555 58.3014C120.56 58.3067 120.56 58.3067 120.565 58.3067C120.848 58.3947 121.141 58.4694 121.443 58.5467C121.453 58.5467 121.464 58.552 121.48 58.5574C122.875 58.896 124.424 59.1334 126.112 59.3014C126.325 59.3227 126.541 59.3414 126.763 59.3627C130.789 59.712 135.56 59.712 140.904 59.8454C152.973 59.5387 162.128 59.928 166.36 55.384C170.907 51.152 170.515 41.9947 170.824 29.9254C170.517 17.8507 170.907 8.69602 166.363 4.46935C162.131 -0.0746511 152.973 0.309349 140.904 1.52588e-05C128.829 0.309349 119.675 -0.0746511 115.448 4.46935C110.904 8.69602 111.288 17.8507 110.979 29.9254C111.117 35.3014 111.117 40.1014 111.472 44.144C111.661 46.2614 111.949 48.1707 112.405 49.848Z" fill="#FF6376"></path>
    </g>
  </svg>
)

export interface InfographicBlockNodeOctaneEvents {
  onCopy?: (code: string) => void
  onExport?: (event: MermaidBlockEvent<{ type: 'export' }>) => void
  onOpenModal?: (event: MermaidBlockEvent<{ type: 'open-modal' }>) => void
  onToggleMode?: (
    target: 'preview' | 'source',
    event: MermaidBlockEvent<{ type: 'toggle-mode', target: 'preview' | 'source' }>,
  ) => void
}

const DEFAULTS = {
  maxHeight: '500px',
  loading: true,
  showHeader: true,
  showCopyButton: true,
  showCollapseButton: true,
  showModeToggle: true,
  showExportButton: true,
  showFullscreenButton: true,
  showZoomControls: true,
}

export function InfographicBlockNode(rawProps: InfographicBlockNodeProps & InfographicBlockNodeOctaneEvents) {
  const props = { ...DEFAULTS, ...rawProps }
  const { t } = useSafeI18n()
  const [copying, setCopying] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [showSource, setShowSource] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [viewportReady, setViewportReady] = useState(() => typeof window === 'undefined')
  const baseCode = props.node.code
  const maxPreviewHeight = useMemo(() => {
    if (!props.maxHeight || props.maxHeight === 'none')
      return null
    return parsePositiveNumber(props.maxHeight)
  }, [props.maxHeight])
  const estimatedPreviewHeight = useMemo(() => {
    return clampInfographicPreviewHeight(
      parsePositiveNumber(props.estimatedPreviewHeightPx) ?? estimateInfographicPreviewHeight(baseCode),
      undefined,
      maxPreviewHeight,
    )
  }, [baseCode, maxPreviewHeight, props.estimatedPreviewHeightPx])
  const [containerHeight, setContainerHeight] = useState(`${estimatedPreviewHeight}px`)
  const [hasPreview, setHasPreview] = useState(false)
  const [hasRenderError, setHasRenderError] = useState(false)

  // Zoom
  const [zoom, setZoom] = useState(1)
  const [translate, setTranslate] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)

  const containerRef = useRef<HTMLDivElement | null>(null)
  const viewportTargetRef = useRef<HTMLDivElement | null>(null)
  const viewportHandleRef = useRef<VisibilityHandle | null>(null)
  const modalContentRef = useRef<HTMLDivElement | null>(null)
  const modalCloneWrapperRef = useRef<HTMLElement | null>(null)
  const panGestureRef = useRef<PanGesture | null>(null)
  const instanceRef = useRef<any>(null)

  // Latest-value mirrors the pan gesture reads at pointerdown, so the instance
  // created below can stay stable for the life of the component.
  const translateRef = useRef(translate)
  translateRef.current = translate
  const zoomRef = useRef(zoom)
  zoomRef.current = zoom
  const modalOpenRef = useRef(modalOpen)
  modalOpenRef.current = modalOpen
  const hasPreviewRef = useRef(hasPreview)
  hasPreviewRef.current = hasPreview
  const renderGenerationRef = useRef(0)
  const registerViewport = useViewportPriority()

  const resolveContainerHeight = useCallback((actualHeight: number) => {
    if (!props.maxHeight || props.maxHeight === 'none')
      return `${Math.max(actualHeight, estimatedPreviewHeight)}px`

    const maxHeight = Number.parseFloat(String(props.maxHeight))
    if (!Number.isFinite(maxHeight))
      return `${Math.max(actualHeight, estimatedPreviewHeight)}px`

    return `${Math.max(Math.min(actualHeight, maxHeight), estimatedPreviewHeight)}px`
  }, [estimatedPreviewHeight, props.maxHeight])

  const updateContainerHeight = useCallback(() => {
    const el = containerRef.current
    if (!el)
      return

    const actualHeight = el.scrollHeight
    if (actualHeight > 0)
      setContainerHeight(resolveContainerHeight(actualHeight))
  }, [resolveContainerHeight])

  useEffect(() => {
    if (showSource || isCollapsed)
      return
    setContainerHeight((current) => {
      const currentHeight = parsePositiveNumber(current)
      if (currentHeight != null && currentHeight >= estimatedPreviewHeight)
        return current
      return `${estimatedPreviewHeight}px`
    })
  }, [estimatedPreviewHeight, isCollapsed, showSource])

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard?.writeText(baseCode)
      setCopying(true)
      props.onCopy?.(baseCode)
      setTimeout(() => setCopying(false), 1000)
    }
    catch {}
  }, [baseCode, props])

  const renderInfographic = useCallback(async () => {
    if (!viewportReady)
      return
    if (!containerRef.current)
      return
    const el = containerRef.current
    const source = baseCode
    const final = props.loading === false
    const generation = ++renderGenerationRef.current
    let nextInstance: any = null
    let previousChildren: ChildNode[] | null = null

    try {
      const InfographicClass = await getInfographic()
      if (generation !== renderGenerationRef.current || el !== containerRef.current)
        return
      if (!InfographicClass)
        throw new Error('Infographic library failed to load.')

      previousChildren = Array.from(el.childNodes)
      nextInstance = new InfographicClass({
        container: el,
        width: '100%',
        height: '100%',
      })
      let renderErrorMessage = ''
      let renderCompleted = false
      nextInstance.on?.('error', (error: unknown) => {
        const errors = Array.isArray(error) ? error : [error]
        renderErrorMessage = errors
          .map((item) => {
            if (item instanceof Error)
              return item.message
            if (typeof item === 'string')
              return item
            if (item && typeof item === 'object' && 'message' in item)
              return String((item as { message?: unknown }).message ?? '')
            return String(item ?? '')
          })
          .filter(Boolean)
          .join('; ')
      })
      nextInstance.on?.('rendered', () => {
        renderCompleted = true
      })
      nextInstance.render(source)
      if (renderErrorMessage)
        throw new Error(renderErrorMessage)
      const nextChildren = Array.from(el.childNodes)
      const replacedChildren = nextChildren.length > 0 && (
        nextChildren.length !== previousChildren.length
        || nextChildren.some((child, index) => child !== previousChildren?.[index])
      )
      if (!renderCompleted && !replacedChildren)
        throw new Error('Infographic render returned empty output.')

      instanceRef.current?.destroy?.()
      instanceRef.current = nextInstance
      nextInstance = null
      setHasPreview(true)
      setHasRenderError(false)

      // Update height
      setTimeout(() => {
        updateContainerHeight()
      }, 0)
    }
    catch (error) {
      if (generation !== renderGenerationRef.current || el !== containerRef.current)
        return
      nextInstance?.destroy?.()
      nextInstance = null
      if (final && props.loading === false && source === baseCode) {
        console.error('Failed to render infographic:', error)
        instanceRef.current?.destroy?.()
        instanceRef.current = null
        setHasPreview(false)
        setHasRenderError(true)
        el.innerHTML = `<div class="text-red-500 p-4">Failed to render infographic: ${error instanceof Error ? error.message : 'Unknown error'}</div>`
      }
      else if (previousChildren) {
        el.replaceChildren(...previousChildren)
      }
    }
    finally {
      nextInstance?.destroy?.()
    }
  }, [baseCode, props.loading, updateContainerHeight, viewportReady])

  useEffect(() => {
    const el = viewportTargetRef.current
    if (!el)
      return
    const handle = registerViewport(el, { rootMargin: '160px' })
    viewportHandleRef.current = handle
    if (handle.isVisible())
      setViewportReady(true)
    handle.whenVisible.then(() => setViewportReady(true))
    return () => {
      handle.destroy()
      viewportHandleRef.current = null
    }
  }, [registerViewport])

  // Effects
  useEffect(() => {
    if (viewportReady && !showSource && !isCollapsed) {
      renderInfographic()
    }
  }, [baseCode, isCollapsed, renderInfographic, showSource, viewportReady])

  useEffect(() => {
    return () => {
      renderGenerationRef.current += 1
      if (instanceRef.current) {
        instanceRef.current.destroy?.()
        instanceRef.current = null
      }
    }
  }, [])

  // Modal logic matching Vue implementation
  const closeModal = useCallback(() => {
    setModalOpen(false)
    if (modalContentRef.current)
      modalContentRef.current.innerHTML = ''
    modalCloneWrapperRef.current = null
    document.body.style.overflow = ''
  }, [])

  const handleOpenModal = useCallback(() => {
    setModalOpen(true)
    document.body.style.overflow = 'hidden'
  }, [])

  useEffect(() => {
    if (!modalOpen)
      return

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape')
        closeModal()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [modalOpen, closeModal])

  useEffect(() => {
    if (!modalOpen)
      return

    // Defer to allow portal to mount
    setTimeout(() => {
      if (containerRef.current && modalContentRef.current) {
        modalContentRef.current.innerHTML = ''
        const wrapper = document.createElement('div')
        Object.assign(wrapper.style, {
          transition: 'transform 0.1s ease',
          transformOrigin: 'center center',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        })

        const clone = containerRef.current.cloneNode(true) as HTMLElement
        clone.classList.add('fullscreen')
        clone.style.height = 'auto'

        wrapper.appendChild(clone)
        modalContentRef.current.appendChild(wrapper)
        modalCloneWrapperRef.current = wrapper

        wrapper.style.transform = `translate(${translate.x}px, ${translate.y}px) scale(${zoom})`
      }
    }, 0)
  }, [modalOpen]) // Intentionally not dependent on zoom/translate to avoid re-cloning

  // Sync transform
  useEffect(() => {
    if (modalOpen && modalCloneWrapperRef.current) {
      modalCloneWrapperRef.current.style.transform = `translate(${translate.x}px, ${translate.y}px) scale(${zoom})`
    }
  }, [modalOpen, translate, zoom])

  const handleExport = useCallback(() => {
    const svg = containerRef.current?.querySelector('svg')
    if (!svg)
      return
    const data = new XMLSerializer().serializeToString(svg)
    const blob = new Blob([data], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `infographic-${Date.now()}.svg`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }, [])

  // The gesture lifecycle (window listeners, pointer identity, lost releases)
  // lives in markstream-core so every package pans identically. It is created
  // once and reads the current values through refs, so re-renders during a drag
  // cannot swap the instance out from under an in-flight gesture.
  if (!panGestureRef.current) {
    panGestureRef.current = createPanGesture({
      getTranslate: () => translateRef.current,
      setTranslate: next => setTranslate(next),
      canStart: (event) => {
        // Nothing to pan until the chart exists, so the pending/error source
        // panel keeps its own text selection and scrolling.
        if (!hasPreviewRef.current)
          return false

        // Touch pans only where the surface claims the gesture; elsewhere the
        // page keeps the swipe for scrolling.
        return event.pointerType !== 'touch'
          || modalOpenRef.current
          || zoomRef.current > 1
      },
      onActiveChange: active => setIsDragging(active),
    })
  }
  const panGesture = panGestureRef.current

  useEffect(() => () => panGesture.stop(), [panGesture])

  const computedButtonClass = props.isDark
    ? 'p-2 text-xs rounded text-gray-400 hover:bg-gray-700 hover:text-gray-200'
    : 'p-2 text-xs rounded text-gray-600 hover:bg-gray-200 hover:text-gray-700'

  const isFullscreenDisabled = showSource || isCollapsed

  // The chart is scaled to fit the preview box, so at fit zoom nothing is
  // off-screen and panning only shifts it inside the box. Touch therefore keeps
  // scrolling the page at that zoom and only claims the gesture once the chart is
  // zoomed in and actually overflows the box. The fullscreen modal always claims
  // it: panning is the intended gesture there.
  const panSurfaceClaimsTouch = modalOpen || zoom > 1

  // JSX Structure mirroring Vue template
  return (
    <>
      <div
        ref={viewportTargetRef}
        data-markstream-infographic="1"
        data-markstream-mode={showSource ? 'source' : hasRenderError ? 'error' : hasPreview ? 'preview' : 'pending'}
        className={clsx('my-4 rounded-lg border overflow-hidden shadow-sm', props.isDark ? 'border-gray-700/30' : 'border-gray-200', { 'is-rendering': props.loading })}
      >
        {props.showHeader && (
          <div className={clsx('flex justify-between items-center px-4 py-2.5 border-b', props.isDark ? 'bg-gray-800 border-gray-700/30' : 'bg-gray-50 border-gray-200')}>
            <div className="flex items-center gap-x-2 overflow-hidden">
              {INFOGRAPHIC_ICON}
              <span className={clsx('text-sm font-medium font-mono truncate', props.isDark ? 'text-gray-400' : 'text-gray-600')}>Infographic</span>
            </div>

            {/* Center Mode Toggle */}
            {props.showModeToggle && (
              <div className={clsx('flex items-center gap-x-1 rounded-md p-0.5', props.isDark ? 'bg-gray-700' : 'bg-gray-100')}>
                <button
                  className={clsx('px-2.5 py-1 text-xs rounded transition-colors', !showSource ? (props.isDark ? 'bg-gray-600 text-gray-200 shadow-sm' : 'bg-white text-gray-700 shadow-sm') : (props.isDark ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700'))}
                  onClick={() => setShowSource(false)}
                  onMouseEnter={e => showTooltipForAnchor(e.currentTarget, t('common.preview') || 'Preview', 'top', false, undefined, props.isDark)}
                  onMouseLeave={() => hideTooltip()}
                >
                  <div className="flex items-center gap-x-1">
                    <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" className="w-3 h-3">
                      <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">
                        <path d="M2.062 12.348a1 1 0 0 1 0-.696a10.75 10.75 0 0 1 19.876 0a1 1 0 0 1 0 .696a10.75 10.75 0 0 1-19.876 0" />
                        <circle cx="12" cy="12" r="3" />
                      </g>
                    </svg>
                    <span>{t('common.preview') || 'Preview'}</span>
                  </div>
                </button>
                <button
                  className={clsx('px-2.5 py-1 text-xs rounded transition-colors', showSource ? (props.isDark ? 'bg-gray-600 text-gray-200 shadow-sm' : 'bg-white text-gray-700 shadow-sm') : (props.isDark ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700'))}
                  onClick={() => setShowSource(true)}
                  onMouseEnter={e => showTooltipForAnchor(e.currentTarget, t('common.source') || 'Source', 'top', false, undefined, props.isDark)}
                  onMouseLeave={() => hideTooltip()}
                >
                  <div className="flex items-center gap-x-1">
                    <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" className="w-3 h-3"><path fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m16 18l6-6l-6-6M8 6l-6 6l6 6" /></svg>
                    <span>{t('common.source') || 'Source'}</span>
                  </div>
                </button>
              </div>
            )}

            {/* Right Actions */}
            <div className="flex items-center gap-x-1">
              {props.showCollapseButton && (
                <button
                  className={computedButtonClass}
                  onClick={() => setIsCollapsed(!isCollapsed)}
                  onMouseEnter={e => showTooltipForAnchor(e.currentTarget, isCollapsed ? (t('common.expand') || 'Expand') : (t('common.collapse') || 'Collapse'), 'top', false, undefined, props.isDark)}
                  onMouseLeave={() => hideTooltip()}
                >
                  <svg style={{ rotate: isCollapsed ? '0deg' : '90deg' }} xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" className="w-3 h-3"><path fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m9 18l6-6l-6-6" /></svg>
                </button>
              )}
              {props.showCopyButton && (
                <button
                  className={computedButtonClass}
                  onClick={handleCopy}
                  onMouseEnter={e => showTooltipForAnchor(e.currentTarget, copying ? (t('common.copied') || 'Copied') : (t('common.copy') || 'Copy'), 'top', false, undefined, props.isDark)}
                  onMouseLeave={() => hideTooltip()}
                >
                  {!copying
                    ? (
                        <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" className="w-3 h-3">
                          <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">
                            <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
                            <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                          </g>
                        </svg>
                      )
                    : (
                        <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" className="w-3 h-3"><path fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 6L9 17l-5-5" /></svg>
                      )}
                </button>
              )}
              {props.showExportButton && (
                <button
                  className={clsx(computedButtonClass, isFullscreenDisabled && 'opacity-50 cursor-not-allowed')}
                  disabled={isFullscreenDisabled}
                  onClick={handleExport}
                  onMouseEnter={e => showTooltipForAnchor(e.currentTarget, t('common.export') || 'Export', 'top', false, undefined, props.isDark)}
                  onMouseLeave={() => hideTooltip()}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" className="w-3 h-3">
                    <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">
                      <path d="M12 15V3m9 12v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <path d="m7 10l5 5l5-5" />
                    </g>
                  </svg>
                </button>
              )}
              {props.showFullscreenButton && (
                <button
                  className={clsx(computedButtonClass, isFullscreenDisabled && 'opacity-50 cursor-not-allowed')}
                  disabled={isFullscreenDisabled}
                  onClick={handleOpenModal}
                  onMouseEnter={e => showTooltipForAnchor(e.currentTarget, modalOpen ? (t('common.minimize') || 'Minimize') : (t('common.open') || 'Open'), 'top', false, undefined, props.isDark)}
                  onMouseLeave={() => hideTooltip()}
                >
                  {!modalOpen
                    ? <svg xmlns="http://www.w3.org/2000/svg" width="0.75rem" height="0.75rem" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 3h6v6m0-6l-7 7M3 21l7-7m-1 7H3v-6" /></svg>
                    : <svg xmlns="http://www.w3.org/2000/svg" width="0.75rem" height="0.75rem" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m14 10l7-7m-1 7h-6V4M3 21l7-7m-6 0h6v6" /></svg>}
                </button>
              )}
            </div>
          </div>
        )}

        {!isCollapsed && (
          <div>
            {showSource
              ? (
                  <div className={clsx('p-4', props.isDark ? 'bg-gray-900' : 'bg-gray-50')}>
                    <pre className={clsx('text-sm font-mono whitespace-pre-wrap', props.isDark ? 'text-gray-300' : 'text-gray-700')}>{baseCode}</pre>
                  </div>
                )
              : (
                  <div className="relative">
                    {props.showZoomControls && (
                      <div className="absolute top-2 right-2 z-10 rounded-lg">
                        <div className="flex items-center gap-2 backdrop-blur rounded-lg">
                          <button
                            className={clsx('p-2 text-xs rounded transition-colors', props.isDark ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-200')}
                            onClick={() => setZoom(Math.min(zoom + 0.1, 3))}
                          >
                            +
                          </button>
                          <button
                            className={clsx('p-2 text-xs rounded transition-colors', props.isDark ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-200')}
                            onClick={() => setZoom(Math.max(zoom - 0.1, 0.5))}
                          >
                            -
                          </button>
                          <button
                            className={clsx('p-2 text-xs rounded transition-colors', props.isDark ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-200')}
                            onClick={() => {
                              setZoom(1)
                              setTranslate({ x: 0, y: 0 })
                            }}
                          >
                            {Math.round(zoom * 100)}
                            %
                          </button>
                        </div>
                      </div>
                    )}
                    <div
                      className={clsx('infographic-preview min-h-[360px] relative transition-all duration-100 overflow-hidden block', props.isDark ? 'bg-gray-900' : 'bg-gray-50', { 'infographic-pan-touch': panSurfaceClaimsTouch })}
                      style={{ height: containerHeight, maxHeight: props.maxHeight ?? undefined }}
                      onPointerDown={event => panGesture.start(event)}
                    >
                      {!hasPreview && !hasRenderError && (
                        <pre className={clsx('absolute inset-0 overflow-auto p-4 text-left text-sm font-mono whitespace-pre-wrap', props.isDark ? 'text-gray-300' : 'text-gray-700')}>{baseCode}</pre>
                      )}
                      <div className={clsx('absolute inset-0 cursor-grab', isDragging && 'cursor-grabbing')} style={{ transform: `translate(${translate.x}px, ${translate.y}px) scale(${zoom})` }}>
                        <div ref={containerRef} className="w-full text-center flex items-center justify-center min-h-full" />
                      </div>
                    </div>
                  </div>
                )}
          </div>
        )}
      </div>

      {modalOpen && typeof document !== 'undefined' && createPortal(
        <div className="markstream-octane fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={closeModal} role="dialog" aria-modal="true">
          <div className={clsx('dialog-panel relative w-full h-full max-w-full max-h-full rounded shadow-lg overflow-hidden', props.isDark ? 'bg-gray-900' : 'bg-white')} onClick={e => e.stopPropagation()}>
            <div className="absolute top-6 right-6 z-50 flex items-center gap-2">
              {/* Zoom controls in modal */}
              <button className={clsx('p-2 text-xs rounded transition-colors', props.isDark ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-200')} onClick={() => setZoom(Math.min(zoom + 0.1, 3))}>+</button>
              <button className={clsx('p-2 text-xs rounded transition-colors', props.isDark ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-200')} onClick={() => setZoom(Math.max(zoom - 0.1, 0.5))}>-</button>
              <button
                className={clsx('p-2 text-xs rounded transition-colors', props.isDark ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-200')}
                onClick={() => {
                  setZoom(1)
                  setTranslate({ x: 0, y: 0 })
                }}
              >
                {Math.round(zoom * 100)}
                %
              </button>
              <button className={clsx('inline-flex items-center justify-center p-2 rounded transition-colors', props.isDark ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-200')} onClick={closeModal}>X</button>
            </div>
            <div
              ref={modalContentRef}
              className={clsx('w-full h-full flex items-center justify-center p-4 overflow-hidden', !isDragging && 'cursor-grab', isDragging && 'cursor-grabbing', { 'infographic-pan-touch': panSurfaceClaimsTouch })}
              onPointerDown={event => panGesture.start(event)}
            />
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
