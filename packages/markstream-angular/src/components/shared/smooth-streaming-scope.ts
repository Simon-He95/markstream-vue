import type { StreamingTextScope } from 'markstream-core'
import { InjectionToken } from '@angular/core'

export interface SmoothStreamingScope {
  textScope?: StreamingTextScope
  isSmoothStreamingEnabled: () => boolean
}

export const MARKSTREAM_SMOOTH_STREAMING_SCOPE
  = new InjectionToken<SmoothStreamingScope>('MARKSTREAM_SMOOTH_STREAMING_SCOPE')
