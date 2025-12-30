import type { NodeComponentProps } from '../../types/node-component'
import clsx from 'clsx'
import React from 'react'
import { renderInline } from '../../renderers/renderChildren'

export function TableNode(props: NodeComponentProps<{ type: 'table', header?: any, rows?: any[], loading?: boolean }>) {
  const { node, ctx, renderNode, indexKey } = props
  const headerCells = Array.isArray(node?.header?.cells) ? node.header.cells : []
  const columnCount = headerCells.length || Math.max(1, node?.rows?.[0]?.cells?.length || 0) || 1
  const baseWidth = Math.floor(100 / columnCount)
  const colWidths = Array.from({ length: columnCount }, (_, idx) => {
    if (idx === columnCount - 1)
      return `${100 - baseWidth * (columnCount - 1)}%`
    return `${baseWidth}%`
  })
  const isLoading = Boolean(node?.loading)
  const bodyRows = Array.isArray(node?.rows) ? node.rows : []

  const getAlignClass = (align?: string) => {
    if (align === 'right')
      return 'text-right'
    if (align === 'center')
      return 'text-center'
    return 'text-left'
  }

  return (
    <div className="table-node-wrapper" data-index-key={indexKey}>
      <table
        className={clsx(
          'w-full my-8 text-sm table-fixed table-node',
          isLoading && 'table-node--loading',
        )}
        aria-busy={isLoading}
      >
        <colgroup>
          {colWidths.map((width, idx) => (
            <col key={`col-${idx}`} style={{ width }} />
          ))}
        </colgroup>
        <thead className="border-[var(--table-border,#cbd5e1)]">
          <tr className="border-b">
            {headerCells.map((cell: any, idx: number) => (
              <th
                key={`header-${idx}`}
                className={clsx('font-semibold p-[calc(4/7*1em)] overflow-x-auto', getAlignClass(cell.align))}
                dir="auto"
              >
                {ctx && renderNode ? renderInline(cell.children, ctx, `${String(indexKey ?? 'table')}-th-${idx}`, renderNode) : null}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {bodyRows.map((row: any, rowIdx: number) => (
            <tr
              key={`row-${rowIdx}`}
              className={clsx(
                'border-[var(--table-border,#cbd5e1)]',
                rowIdx < bodyRows.length - 1 && 'border-b',
              )}
            >
              {row.cells?.map((cell: any, cellIdx: number) => (
                <td
                  key={`cell-${rowIdx}-${cellIdx}`}
                  className={clsx('p-[calc(4/7*1em)] overflow-x-auto', getAlignClass(cell.align))}
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
