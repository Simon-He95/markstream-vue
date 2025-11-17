<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'

// 定义图片节点类型
interface ImageNode {
  type: 'image'
  src: string
  alt: string
  title: string | null
  raw: string
}

const zoom = ref(1)
const minZoom = 0.2
const maxZoom = 3
const zoomStep = 0.1

const onWheel = (e: WheelEvent) => {
  if (!showPreview.value) return
  e.preventDefault()
  // 鼠标滚轮也可缩放
  if (e.deltaY < 0) {
    zoom.value = Math.min(maxZoom, +(zoom.value + zoomStep).toFixed(2))
  } else {
    zoom.value = Math.max(minZoom, +(zoom.value - zoomStep).toFixed(2))
  }
}

const props = defineProps<{
  node: ImageNode & { loading?: boolean }
}>()

// 从 node 对象中提取 src 和 alt
const src = computed(() => props.node.src)
const alt = computed(() => props.node.alt || '')

const showPreview = ref(false)
const isLoading = ref(true)

const openPreview = () => {
  showPreview.value = true
  zoom.value = 1
}

const closePreview = () => {
  showPreview.value = false
}

// ESC 键关闭
const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape' && showPreview.value) {
    closePreview()
  }
}

const handleError = () => {
  isLoading.value = false
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
  // 检测图片加载完成
  const img = new Image()
  img.onload = () => {
    isLoading.value = false
  }
  img.onerror = () => {
    isLoading.value = false
  }
  img.src = src.value
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div class="image-wrapper">
    <!-- 缩略图 -->
    <img
      :src="src"
      :alt="alt"
      :title="node.title || undefined"
      class="image-thumbnail"
      :class="{ loading: isLoading }"
      @click="openPreview"
      @error="handleError"
    />

    <!-- 放大预览弹窗 -->
    <Teleport to="body">
      <Transition name="preview-fade">
        <div v-if="showPreview" class="image-preview-overlay" @click="closePreview">
          <div class="preview-container" @click.stop>
            <img
              :src="src"
              :alt="alt"
              class="preview-image"
              :style="{ transform: `scale(${zoom})` }"
              @wheel="onWheel"
              draggable="false"
            />
          </div>
          <button class="preview-close" @click="closePreview" title="关闭 (ESC)">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M18 6L6 18M6 6l12 12" stroke-width="2" stroke-linecap="round" />
            </svg>
          </button>
          <div class="preview-zoom-ctrl-bottom">
            <input
              type="range"
              class="zoom-slider"
              :min="minZoom"
              :max="maxZoom"
              :step="zoomStep"
              v-model.number="zoom"
            />
            <span class="zoom-text">{{ Math.round(zoom * 100) }}%</span>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.preview-zoom-ctrl-bottom {
  position: fixed;
  left: 50%;
  bottom: 24px;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 8px;
  z-index: 10000;
  background: rgba(0, 0, 0, 0.5);
  padding: 8px 18px;
  border-radius: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}
.zoom-slider {
  width: 120px;
  accent-color: #409eff;
  margin-right: 10px;
  vertical-align: middle;
  height: 4px;
}
.zoom-text {
  color: #fff;
  font-size: 15px;
  min-width: 48px;
  text-align: center;
  user-select: none;
}
.preview-container {
  position: relative;
}
.preview-image {
  transition: transform 0.2s cubic-bezier(0.4, 2, 0.6, 1);
}
.image-wrapper {
  display: inline-block;
  margin: 4px 0;
  vertical-align: middle;
}

.image-thumbnail {
  max-width: 300px;
  max-height: 200px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  display: block;
}

.image-thumbnail:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  transform: scale(1.02);
}

.image-thumbnail.loading {
  opacity: 0.6;
  background: #f3f4f6;
}

/* 预览弹窗样式 */
.image-preview-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  cursor: pointer;
  backdrop-filter: blur(4px);
}

.preview-container {
  position: relative;
  max-width: 90vw;
  max-height: 90vh;
  cursor: default;
}

.preview-image {
  max-width: 90vw;
  max-height: 90vh;
  border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  display: block;
}

.preview-close {
  position: fixed;
  top: 18px;
  right: 18px;
  background: rgba(255, 255, 255, 0.9);
  border: none;
  border-radius: 50%;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
  color: #333;
  z-index: 10000;
}
.preview-close:hover {
  background: white;
  transform: scale(1.1);
}

.preview-fade-enter-from .preview-container {
  transform: scale(0.9);
}

.preview-fade-leave-to .preview-container {
  transform: scale(0.9);
}
</style>
