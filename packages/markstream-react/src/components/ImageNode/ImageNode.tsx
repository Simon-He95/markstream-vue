import type { ImageNodeProps } from '../../types/component-props'
import React, { useEffect, useState } from 'react'
import { sanitizeImageSrc } from 'stream-markdown-parser'

const DEFAULT_PROPS = {
  fallbackSrc: '',
  lazy: true,
  usePlaceholder: true,
}

export interface ImageNodeReactEvents {
  onLoad?: (src: string) => void
  onError?: (src: string) => void
  onClick?: (payload: [event: React.MouseEvent<HTMLImageElement>, src: string]) => void
}

type ImageStage = 'primary' | 'fallback' | 'failed'

function resolveImageState(primarySrc: string, fallbackSrc: string, loading?: boolean): { src: string, stage: ImageStage } {
  if (loading || primarySrc)
    return { src: primarySrc, stage: 'primary' }
  if (fallbackSrc)
    return { src: fallbackSrc, stage: 'fallback' }
  return { src: '', stage: 'failed' }
}

export function ImageNode(rawProps: ImageNodeProps & ImageNodeReactEvents) {
  const props = { ...DEFAULT_PROPS, ...rawProps }
  const safeNodeSrc = sanitizeImageSrc(props.node.src)
  const safeFallbackSrc = sanitizeImageSrc(props.fallbackSrc)
  const initialImageState = resolveImageState(safeNodeSrc, safeFallbackSrc, props.node.loading)
  const [imageLoaded, setImageLoaded] = useState(false)
  const [hasError, setHasError] = useState(false)
  const [activeSrc, setActiveSrc] = useState(initialImageState.src)
  const [imageStage, setImageStage] = useState<ImageStage>(initialImageState.stage)

  const displaySrc = activeSrc

  useEffect(() => {
    const next = resolveImageState(safeNodeSrc, safeFallbackSrc, props.node.loading)
    setActiveSrc(next.src)
    setImageStage(next.stage)
    setImageLoaded(false)
    setHasError(next.stage === 'failed')
  }, [safeNodeSrc, safeFallbackSrc, props.node.loading])

  const handleImageError = () => {
    if (imageStage === 'primary' && safeFallbackSrc && safeFallbackSrc !== activeSrc) {
      setActiveSrc(safeFallbackSrc)
      setImageStage('fallback')
      setImageLoaded(false)
      setHasError(false)
      return
    }

    setImageStage('failed')
    setHasError(true)
    props.onError?.(activeSrc)
  }

  const handleImageLoad = () => {
    setImageLoaded(true)
    setHasError(false)
    props.onLoad?.(displaySrc)
  }

  const handleClick = (event: React.MouseEvent<HTMLImageElement>) => {
    event.preventDefault()
    if (!imageLoaded || hasError) {
      return
    }
    props.onClick?.([event, displaySrc])
  }

  if (!props.node.loading && imageStage !== 'failed' && displaySrc) {
    return (
      <img
        key="image"
        src={displaySrc}
        alt={String(props.node.alt ?? props.node.title ?? '')}
        title={String(props.node.title ?? props.node.alt ?? '')}
        className={`image-node__img${imageLoaded ? ' is-loaded' : ''}`}
        loading={props.lazy ? 'lazy' : 'eager'}
        decoding="async"
        tabIndex={imageLoaded ? 0 : -1}
        aria-label={props.node.alt ?? 'Preview image'}
        onError={handleImageError}
        onLoad={handleImageLoad}
        onClick={handleClick}
      />
    )
  }

  if (props.node.loading && !hasError) {
    return (
      <span key="placeholder" className="image-node__placeholder">
        {props.usePlaceholder
          ? (
              <>
                <span className="image-node__spinner" aria-hidden="true" />
                <span className="image-node__placeholder-text">Loading image...</span>
              </>
            )
          : (
              <span className="image-node__placeholder-text">{props.node.raw ?? 'Loading image…'}</span>
            )}
      </span>
    )
  }

  if (!props.node.loading && imageStage === 'failed') {
    return (
      <span className="image-node__error">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            fill="currentColor"
            d="M2 2h20v10h-2V4H4v9.586l5-5L14.414 14L13 15.414l-4-4l-5 5V20h8v2H2zm13.547 5a1 1 0 1 0 0 2a1 1 0 0 0 0-2m-3 1a3 3 0 1 1 6 0a3 3 0 0 1-6 0m3.625 6.757L19 17.586l2.828-2.829l1.415 1.415L20.414 19l2.829 2.828l-1.415 1.415L19 20.414l-2.828 2.829l-1.415-1.415L17.586 19l-2.829-2.828z"
          />
        </svg>
        <span className="image-node__placeholder-text">Image failed to load</span>
      </span>
    )
  }

  return null
}

export default ImageNode
