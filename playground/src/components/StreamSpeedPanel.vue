<script setup lang="ts">
const props = defineProps<{
  mode: 'tps' | 'chunks'
  targetTps: number
  actualTps: number
  totalTokens: number
  elapsedMs: number
  progress: number
  isStreaming: boolean
  isPaused: boolean
  smoothStreaming: boolean
}>()

const emit = defineEmits<{
  mode: [value: 'tps' | 'chunks']
  speed: [value: number]
}>()

const speeds = [100, 200, 300, 500, 1000]

function applyCustomSpeed(event: Event) {
  const input = event.target as HTMLInputElement
  const value = Number(input.value)
  if (input.value && Number.isFinite(value))
    emit('speed', Math.round(Math.min(2000, Math.max(1, value))))
  input.value = String(props.targetTps)
}
</script>

<template>
  <section class="speed-panel" aria-label="Stream speed comparison">
    <div class="speed-panel__heading">
      <div>
        <h2>Stream simulator</h2>
        <p>Same Markdown. Different delivery speeds.</p>
      </div>
      <div class="speed-mode" role="group" aria-label="Simulation mode">
        <button :aria-pressed="mode === 'tps'" @click="emit('mode', 'tps')">
          Estimated TPS
        </button>
        <button :aria-pressed="mode === 'chunks'" @click="emit('mode', 'chunks')">
          Random chunks
        </button>
      </div>
    </div>

    <template v-if="mode === 'tps'">
      <div class="speed-presets" role="group" aria-label="Target speed presets">
        <button
          v-for="speed in speeds"
          :key="speed"
          :aria-pressed="targetTps === speed"
          :aria-label="`${speed} estimated TPS`"
          @click="emit('speed', speed)"
        >
          <span class="speed-presets__rate">{{ speed }} <small>TPS</small></span>
          <span class="speed-presets__time">~{{ (totalTokens / speed).toFixed(1) }}s <span class="speed-presets__total">total</span></span>
        </button>
      </div>

      <div class="speed-custom">
        <label for="custom-tps">Custom speed</label>
        <div class="speed-custom__input">
          <input id="custom-tps" :value="targetTps" type="number" min="1" max="2000" step="1" @change="applyCustomSpeed">
          <span>TPS</span>
        </div>
        <span class="speed-custom__hint">Select a speed to replay from the start.</span>
      </div>

      <dl class="speed-metrics">
        <div class="speed-metrics__target">
          <dt>Target input</dt>
          <dd>{{ targetTps }} <small>TPS</small></dd>
        </div>
        <div>
          <dt>Average input</dt>
          <dd>{{ actualTps.toFixed(0) }} <small>TPS</small></dd>
        </div>
        <div>
          <dt>Active time</dt>
          <dd>{{ (elapsedMs / 1000).toFixed(1) }} <small>s</small></dd>
        </div>
        <div>
          <dt>Input sent</dt>
          <dd>{{ Math.floor(progress) }}<small>%</small></dd>
        </div>
      </dl>

      <div class="speed-status">
        <span class="speed-status__state" role="status">
          <span class="speed-status__dot" :class="{ 'speed-status__dot--active': isStreaming && !isPaused }" />
          {{ isStreaming ? (isPaused ? 'Input paused' : 'Sending input') : (progress >= 100 ? 'Input complete' : 'Ready') }}
        </span>
        <span>{{ smoothStreaming ? 'Smoothing on: display may trail input.' : 'Smoothing off: displaying incoming chunks.' }}</span>
      </div>
      <p class="speed-panel__note">
        Visual approximation: 1 token = 4 Unicode characters. These are input rates, not model benchmarks or rendering FPS.
      </p>
    </template>
    <p v-else class="speed-panel__note">
      Vary chunk sizes and delays in Controls. Stream settings apply when you replay.
    </p>
  </section>
</template>

<style src="../../../playground-shared/speed-panel.css"></style>
