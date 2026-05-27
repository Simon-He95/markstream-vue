import type { TableCellNode, TableRowNode } from 'stream-markdown-parser'
import type { NodeComponentProps } from '../../types/node-component'
import clsx from 'clsx'
import React from 'react'
import { renderInline } from '../../renderers/renderChildren'

export function TableNode(props: NodeComponentProps<{ type: 'table', header?: TableRowNode, rows?: TableRowNode[], loading?: boolean }>) {
  const { node, ctx, renderNode, indexKey } = props
  const headerCells = Array.isArray(node?.header?.cells) ? node.header.cells : []
  const isLoading = Boolean(node?.loading)
  const bodyRows = Array.isArray(node?.rows) ? node.rows : []
  const tableRef = React.useRef<HTMLTableElement | null>(null)
  const resizeStateRef = React.useRef<{
    index: number
    startX: number
    startWidth: number
    nextStartWidth: number
    widths: number[]
  } | null>(null)
  const resizeListenersRef = React.useRef<{
    move: (event: PointerEvent) => void
    stop: () => void
  } | null>(null)
  const [columnWidths, setColumnWidths] = React.useState<number[]>([])

  const minColumnWidth = 48

  const getAlignClass = (align?: string) => {
    if (align === 'right')
      return 'text-right'
    if (align === 'center')
      return 'text-center'
    return 'text-left'
  }

  const measureHeaderWidths = () => {
    const cells = tableRef.current?.querySelectorAll('thead th')
    return Array.from(cells ?? [], cell => Math.round(cell.getBoundingClientRect().width))
  }

  const stopColumnResize = () => {
    const listeners = resizeListenersRef.current
    if (listeners) {
      window.removeEventListener('pointermove', listeners.move)
      window.removeEventListener('pointerup', listeners.stop)
      window.removeEventListener('pointercancel', listeners.stop)
      resizeListenersRef.current = null
    }
    resizeStateRef.current = null
  }

  const startColumnResize = (index: number, event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0)
      return

    const widths = measureHeaderWidths()
    const startWidth = widths[index]
    const nextStartWidth = widths[index + 1]
    if (!startWidth || !nextStartWidth)
      return

    event.preventDefault()
    stopColumnResize()

    resizeStateRef.current = {
      index,
      startX: event.clientX,
      startWidth,
      nextStartWidth,
      widths,
    }
    setColumnWidths(widths)

    const move = (moveEvent: PointerEvent) => {
      const resizeState = resizeStateRef.current
      if (!resizeState)
        return

      moveEvent.preventDefault()

      const pairWidth = resizeState.startWidth + resizeState.nextStartWidth
      const minWidth = Math.min(minColumnWidth, Math.floor(pairWidth / 2))
      const width = Math.max(
        minWidth,
        Math.min(pairWidth - minWidth, Math.round(resizeState.startWidth + moveEvent.clientX - resizeState.startX)),
      )
      const nextWidths = [...resizeState.widths]
      nextWidths[resizeState.index] = width
      nextWidths[resizeState.index + 1] = pairWidth - width
      setColumnWidths(nextWidths)
    }
    const stop = () => {
      stopColumnResize()
    }

    resizeListenersRef.current = { move, stop }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
  }

  React.useEffect(() => {
    stopColumnResize()
    setColumnWidths([])

    return stopColumnResize
  }, [headerCells.length])

  return (
    <div className="table-node-wrapper" data-index-key={indexKey}>
      <table
        ref={tableRef}
        className={clsx(
          'my-8 text-sm table-node',
          isLoading && 'table-node--loading',
        )}
        aria-busy={isLoading}
      >
        {columnWidths.length > 0 && (
          <colgroup>
            {headerCells.map((_, idx: number) => (
              <col key={`col-${idx}`} style={columnWidths[idx] > 0 ? { width: `${columnWidths[idx]}px` } : undefined} />
            ))}
          </colgroup>
        )}
        <thead className="border-[var(--table-border,#cbd5e1)]">
          <tr className="border-b">
            {headerCells.map((cell: TableCellNode, idx: number) => (
              <th
                key={`header-${idx}`}
                className={clsx('font-semibold p-[calc(4/7*1em)]', getAlignClass(cell.align))}
                dir="auto"
              >
                {ctx && renderNode ? renderInline(cell.children, ctx, `${String(indexKey ?? 'table')}-th-${idx}`, renderNode) : null}
                {idx < headerCells.length - 1 && (
                  <button
                    type="button"
                    className="table-node__resize-handle"
                    aria-label={`Resize columns ${idx + 1} and ${idx + 2}`}
                    onPointerDown={event => startColumnResize(idx, event)}
                  />
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {bodyRows.map((row: TableRowNode, rowIdx: number) => (
            <tr
              key={`row-${rowIdx}`}
              className={clsx(
                'border-[var(--table-border,#cbd5e1)]',
                rowIdx < bodyRows.length - 1 && 'border-b',
              )}
            >
              {row.cells?.map((cell: TableCellNode, cellIdx: number) => (
                <td
                  key={`cell-${rowIdx}-${cellIdx}`}
                  className={clsx('p-[calc(4/7*1em)]', getAlignClass(cell.align))}
                  dir="auto"
                >
                  {ctx && renderNode ? renderInline(cell.children, ctx, `${String(indexKey ?? 'table')}-row-${rowIdx}-${cellIdx}`, renderNode) : null}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {isLoading && (
        <div className="table-node__loading" role="status" aria-live="polite">
          <span className="table-node__spinner" aria-hidden="true" />
          <span className="sr-only">Loading</span>
        </div>
      )}
    </div>
  )
}

export default TableNode
