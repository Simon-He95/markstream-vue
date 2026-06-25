import { computed, watchEffect } from 'vue'
import { useLocalStorage } from '@vueuse/core'
import { setDefaultI18nMap } from 'markstream-vue'

export function usePlaygroundI18n() {
  const isZh = useLocalStorage('vmr-settings-is-zh', true)

  const translations: Record<string, Record<string, string>> = {
    zh: {
      'controls': '控制面板',
      'brandTheme': '品牌主题',
      'default': '默认',
      'codeTheme': '代码主题',
      'htmlPolicy': 'HTML 策略',
      'trusted': '受信任 (Trusted)',
      'safe': '安全 (Safe)',
      'escape': '转义 (Escape)',
      'streamProfile': '流式传输配置',
      'custom': '自定义',
      'transport': '传输通道',
      'sliceMode': '切片模式',
      'pureRandom': '纯随机',
      'boundaryAware': '边界感知',
      'chunkDelay': '分块延迟',
      'min': '最小',
      'max': '最大',
      'chunkSize': '分块大小',
      'burstiness': '突发指数',
      'darkMode': '深色模式',
      'smoothStream': '平滑流式渲染',
      'window': '窗口',
      'chars': '字符',
      'ready': '就绪',
      'streaming': '正在渲染',
      'paused': '已暂停',
      'autoTheme': '自动主题',
      'star': '项目 Star',
      'docs': '官方文档',
      'themes': '主题画廊',
      'virtualScrollLab': '虚拟滚动实验室',
      'virtualTimeline': '虚拟时间线',
      'vueScroller': 'Vue 滚动器',
      'retry': '重新渲染',
      'resume': '继续',
      'pause': '暂停',
      'test': '性能测试',
      'cdn': 'CDN 镜像',
      'livePlayground': '实时演练沙箱',
      'chunk': '分块大小',
      'delay': '延迟范围',
      'burst': '突发度',
      'language': '语言 / Language',
      'subtitle': '流式 Markdown 渲染器',
      'readableStreamOption': 'ReadableStream (读取器)',
      'schedulerOption': 'Scheduler (调度器)',
      'reader': 'ReadableStream 读取器',
      'scheduler': 'Scheduler 调度器',
      'customPresetDesc': '自定义最小/最大窗口及突发特性。',
    },
    en: {
      'controls': 'Controls',
      'brandTheme': 'Brand Theme',
      'default': 'Default',
      'codeTheme': 'Code Theme',
      'htmlPolicy': 'HTML Policy',
      'trusted': 'Trusted',
      'safe': 'Safe',
      'escape': 'Escape',
      'streamProfile': 'Stream Profile',
      'custom': 'Custom',
      'transport': 'Transport',
      'sliceMode': 'Slice Mode',
      'pureRandom': 'Pure Random',
      'boundaryAware': 'Boundary Aware',
      'chunkDelay': 'Chunk Delay',
      'min': 'Min',
      'max': 'Max',
      'chunkSize': 'Chunk Size',
      'burstiness': 'Burstiness',
      'darkMode': 'Dark Mode',
      'smoothStream': 'Smooth Stream',
      'window': 'Window',
      'chars': 'chars',
      'ready': 'Ready',
      'streaming': 'Streaming',
      'paused': 'Paused',
      'autoTheme': 'Auto Theme',
      'star': 'Star',
      'docs': 'Docs',
      'themes': 'Themes',
      'virtualScrollLab': 'Virtual scroll lab',
      'virtualTimeline': 'Virtual timeline',
      'vueScroller': 'Vue scroller',
      'retry': 'Retry',
      'resume': 'Resume',
      'pause': 'Pause',
      'test': 'Test',
      'cdn': 'CDN',
      'livePlayground': 'Live Playground',
      'chunk': 'Chunk Size',
      'delay': 'Delay',
      'burst': 'Burst',
      'language': 'Language / 语言',
      'subtitle': 'Streaming Markdown Renderer',
      'readableStreamOption': 'ReadableStream (Reader)',
      'schedulerOption': 'Scheduler',
      'reader': 'ReadableStream Reader',
      'scheduler': 'Scheduler',
      'customPresetDesc': 'Custom min/max window with your own burst profile.',
    }
  }

  function t(key: string) {
    const lang = isZh.value ? 'zh' : 'en'
    return translations[lang][key] || key
  }

  function getPresetLabel(preset: { label: string }) {
    if (isZh.value) {
      const labelMap: Record<string, string> = {
        'Balanced': '平衡模式',
        'SSE': 'SSE 模式',
        'WebSocket': 'WebSocket 模式',
        'Proxy Buffered': '代理缓冲模式',
        'Weak Mobile': '弱网移动端',
      }
      return labelMap[preset.label] || preset.label
    }
    return preset.label
  }

  function getPresetDescription(preset: any) {
    if (!preset)
      return t('customPresetDesc')
    return isZh.value ? preset.descriptionZh : preset.description
  }

  watchEffect(() => {
    if (isZh.value) {
      setDefaultI18nMap({
        'common.copy': '复制',
        'common.copied': '已复制',
        'common.decrease': '减少',
        'common.reset': '重置',
        'common.increase': '增加',
        'common.expand': '展开',
        'common.collapse': '折叠',
        'common.preview': '预览',
        'common.source': '源代码',
        'common.export': '导出',
        'common.open': '打开',
        'common.zoomIn': '放大',
        'common.zoomOut': '缩小',
        'common.resetZoom': '重置缩放',
        'image.loadError': '图片加载失败',
        'image.loading': '正在加载图片...',
      })
    } else {
      setDefaultI18nMap({
        'common.copy': 'Copy',
        'common.copied': 'Copied',
        'common.decrease': 'Decrease',
        'common.reset': 'Reset',
        'common.increase': 'Increase',
        'common.expand': 'Expand',
        'common.collapse': 'Collapse',
        'common.preview': 'Preview',
        'common.source': 'Source',
        'common.export': 'Export',
        'common.open': 'Open',
        'common.zoomIn': 'Zoom in',
        'common.zoomOut': 'Zoom out',
        'common.resetZoom': 'Reset zoom',
        'image.loadError': 'Image failed to load',
        'image.loading': 'Loading image...',
      })
    }
  })

  return {
    isZh,
    t,
    getPresetLabel,
    getPresetDescription
  }
}
