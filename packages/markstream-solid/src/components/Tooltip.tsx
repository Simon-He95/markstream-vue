export interface TooltipProps { text?: string }
export type TooltipPlacement = 'top' | 'bottom' | 'left' | 'right'
export const Tooltip = (props: TooltipProps) => <span class="tooltip-element">{props.text || ''}</span>
