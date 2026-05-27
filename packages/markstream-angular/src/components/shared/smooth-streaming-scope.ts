import { InjectionToken } from '@angular/core'

export interface SmoothStreamingScope {
  isSmoothStreamingEnabled: () => boolean
}

export const MARKSTREAM_SMOOTH_STREAMING_SCOPE
  = new InjectionToken<SmoothStreamingScope>('MARKSTREAM_SMOOTH_STREAMING_SCOPE')
