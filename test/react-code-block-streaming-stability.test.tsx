/**
 * @vitest-environment jsdom
 */

import React, { act, useEffect, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { NodeRenderer } from '../packages/markstream-react/src/components/NodeRenderer'
import { removeCustomComponents, setCustomComponents } from '../packages/markstream-react/src/customComponents'

const scopeId = 'react-code-block-streaming-stability'

let mountCount = 0
let unmountCount = 0
let instanceSequence = 0

function CodeBlockProbe(props: any) {
  const instanceIdRef = useRef(++instanceSequence)

  useEffect(() => {
    mountCount++
    return () => {
      unmountCount++
    }
  }, [])

  return (
    <div
      className="code-block-probe"
      data-instance-id={String(instanceIdRef.current)}
      data-code={String(props.node?.code ?? '')}
    />
  )
}

async function flushReact() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

afterEach(() => {
  removeCustomComponents(scopeId)
  document.body.innerHTML = ''
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = false
  mountCount = 0
  unmountCount = 0
  instanceSequence = 0
})

describe('markstream-react code block streaming stability', () => {
  it('keeps the same code_block instance while streamed content grows', async () => {
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
    setCustomComponents(scopeId, { code_block: CodeBlockProbe as any })

    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    const renderNodes = (code: string) =>
      React.createElement(NodeRenderer as any, {
        customId: scopeId,
        nodes: [
          {
            type: 'code_block',
            language: 'ts',
            code,
            raw: `\`\`\`ts\n${code}`,
            loading: true,
          },
        ],
        viewportPriority: false,
        deferNodesUntilVisible: false,
        batchRendering: false,
        maxLiveNodes: 0,
      })

    await act(async () => {
      root.render(renderNodes('export const a = 1'))
    })
    await flushReact()

    const initialProbe = host.querySelector('.code-block-probe') as HTMLElement | null
    const initialInstanceId = initialProbe?.getAttribute('data-instance-id')

    expect(initialProbe).toBeTruthy()
    expect(initialProbe?.getAttribute('data-code')).toBe('export const a = 1')
    expect(mountCount).toBe(1)
    expect(unmountCount).toBe(0)

    await act(async () => {
      root.render(renderNodes('export const a = 1\nexport const b = 2'))
    })
    await flushReact()

    const updatedProbe = host.querySelector('.code-block-probe') as HTMLElement | null
    expect(updatedProbe).toBeTruthy()
    expect(updatedProbe?.getAttribute('data-instance-id')).toBe(initialInstanceId)
    expect(updatedProbe?.getAttribute('data-code')).toBe('export const a = 1\nexport const b = 2')
    expect(mountCount).toBe(1)
    expect(unmountCount).toBe(0)

    await act(async () => {
      root.unmount()
    })
  })
})
