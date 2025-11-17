<script setup lang="ts">
import { onUnmounted, ref } from 'vue'
import MarkdownRender from '../../../src/components/NodeRenderer'
import { removeCustomComponents, setCustomComponents } from '../../../src/utils/nodeComponents'
import ImageViewer from '../components/imageViewer.vue'
import KatexWorker from '../../../src/workers/katexRenderer.worker?worker&inline'
import { setKaTeXWorker } from '../../../src/workers/katexWorkerClient'
import MermaidWorker from '../../../src/workers/mermaidParser.worker?worker&inline'
import { setMermaidWorker } from '../../../src/workers/mermaidWorkerClient'
import 'katex/dist/katex.min.css'

// 初始化 Workers
setKaTeXWorker(new KatexWorker())
setMermaidWorker(new MermaidWorker())

// 注册自定义图片组件
setCustomComponents('custom-image-demo', { image: ImageViewer })

// 示例 Markdown 内容，包含图片
const content = ref(`
# 自定义图片渲染示例

这是一个使用自定义组件渲染图片的示例。点击图片可以放大预览。点开的图不一样是因为接口返回的是随机图片。

## 示例图片

![示例图片](https://picsum.photos/800/600?random=1)

这是一张随机图片，支持点击放大、缩放等功能。

![另一张图片](https://picsum.photos/600/400?random=2)

## 功能特点

- 点击图片放大预览
- 支持鼠标滚轮缩放
- 支持滑块调节缩放比例
- ESC 键关闭预览
- 优雅的过渡动画
`)

// 清理自定义组件
onUnmounted(() => {
  try {
    removeCustomComponents('custom-image-demo')
  }
  catch (error) {
    console.error('Failed to remove custom components:', error)
  }
})
</script>

<template>
  <div class="custom-image-page">
    <div class="container">
      <div class="header">
        <h1>自定义图片渲染演示</h1>
        <p class="subtitle">使用 setCustomComponents 注册 imageViewer 组件实现自定义图片渲染</p>
      </div>

      <div class="content-wrapper">
        <MarkdownRender
          :content="content"
          custom-id="custom-image-demo"
          class="markdown-content"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.custom-image-page {
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 2rem;
}

.container {
  max-width: 900px;
  margin: 0 auto;
  background: white;
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  overflow: hidden;
}

.header {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 3rem 2rem;
  text-align: center;
}

.header h1 {
  margin: 0 0 1rem 0;
  font-size: 2.5rem;
  font-weight: 700;
}

.subtitle {
  margin: 0;
  font-size: 1.1rem;
  opacity: 0.95;
  font-weight: 300;
}

.content-wrapper {
  padding: 2rem;
}

.markdown-content {
  line-height: 1.8;
  color: #333;
}

.markdown-content :deep(h2) {
  color: #667eea;
  margin-top: 2rem;
  margin-bottom: 1rem;
  font-size: 1.8rem;
  font-weight: 600;
}

.markdown-content :deep(p) {
  margin-bottom: 1rem;
  color: #555;
}

.markdown-content :deep(ul) {
  margin-left: 1.5rem;
  margin-bottom: 1rem;
}

.markdown-content :deep(li) {
  margin-bottom: 0.5rem;
  color: #555;
}

/* 暗色主题支持 */
@media (prefers-color-scheme: dark) {
  .container {
    background: #1a1a2e;
  }

  .markdown-content {
    color: #e0e0e0;
  }

  .markdown-content :deep(h2) {
    color: #8b9bea;
  }

  .markdown-content :deep(p),
  .markdown-content :deep(li) {
    color: #c0c0c0;
  }
}
</style>
