import type { ParsedNode } from 'stream-markdown-parser'
import type { NodeComponentProps } from '../../types/node-component'
import React from 'react'
import { NodeRenderer } from '../NodeRenderer'

export function BlockquoteNode(props: NodeComponentProps<{ type: 'blockquote', children?: ParsedNode[] }>) {
  const { node, ctx, renderNode, indexKey, children } = props
  return (
    <blockquote className="blockquote-node" dir="auto" cite={(node as any).cite}>
      {children ?? (ctx && renderNode
        ? (
            <NodeRenderer
              nodes={node.children || []}
              indexKey={`blockquote-${String(indexKey ?? 'blockquote')}`}
              customId={ctx.customId}
              isDark={ctx.isDark}
              typewriter={ctx.typewriter}
              viewportPriority
              codeBlockStream={ctx.codeBlockStream}
              renderCodeBlocksAsPre={ctx.renderCodeBlocksAsPre}
              codeBlockProps={ctx.codeBlockProps}
              themes={ctx.codeBlockThemes?.themes}
              codeBlockDarkTheme={ctx.codeBlockThemes?.darkTheme}
              codeBlockLightTheme={ctx.codeBlockThemes?.lightTheme}
              codeBlockMonacoOptions={ctx.codeBlockThemes?.monacoOptions}
              codeBlockMinWidth={ctx.codeBlockThemes?.minWidth}
              codeBlockMaxWidth={ctx.codeBlockThemes?.maxWidth}
              onCopy={ctx.events.onCopy}
              onHandleArtifactClick={ctx.events.onHandleArtifactClick}
            />
          )
        : null)}
    </blockquote>
  )
}

export default BlockquoteNode
