---
title: AntV Infographic 图表集成
description: 在 markstream-vue 中接入 AntV Infographic 图表，介绍安装依赖、loader 配置与流式 infographic 代码块的渲染方式。
keywords:
  - AntV Infographic
  - 图表渲染
  - 流式图表
---

# AntV Infographic

`markstream-vue` 支持渲染 [AntV Infographic](https://infographic.antv.vision/) 图表。

## 1. 安装

该功能依赖 `@antv/infographic` 库。

```bash
npm install @antv/infographic
```

在应用入口中配置可选 loader，并确保它发生在 `app.mount()` 或首个 infographic 代码块渲染之前：

```ts
// main.ts
import { setInfographicLoader } from 'markstream-vue'
import { createApp } from 'vue'
import App from './App.vue'

setInfographicLoader(() => import('@antv/infographic'))

createApp(App).mount('#app')
```

迁移提示：infographic 渲染现在需要显式 opt-in。如果你的应用之前依赖“安装 `@antv/infographic` 后自动渲染图表”的行为，请继续安装该依赖，并补上上面的 loader 配置。

## 2. 示例

在 Markdown 中使用 `infographic` 代码块即可渲染图表：

````md
```infographic
infographic list-row-simple-horizontal-arrow
data
  items
    - label Step 1
      desc Start
    - label Step 2
      desc Processing
    - label Step 3
      desc Complete
```
````

![Infographic demo](/screenshots/infographic-demo.png)

## 3. 更多资源

- [AntV Infographic 官网](https://infographic.antv.vision/) - 查看更多图表模版与语法的详细介绍。
