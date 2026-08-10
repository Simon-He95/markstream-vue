---
title: AntV Infographic
description: Render AntV Infographic charts in markstream-vue through custom components for streaming data-driven visualizations.
keywords:
  - antv infographic
  - chart rendering markdown
  - infographic quick start
  - custom chart components
---
# AntV Infographic

`markstream-vue` supports rendering [AntV Infographic](https://infographic.antv.vision/) charts.

## 1. Installation

This feature depends on the `@antv/infographic` library.

```bash
npm install @antv/infographic
```

Configure the optional loader in your app entry before `app.mount()` or before the first infographic block is rendered:

```ts
// main.ts
import { setInfographicLoader } from 'markstream-vue'
import { createApp } from 'vue'
import App from './App.vue'

setInfographicLoader(() => import('@antv/infographic'))

createApp(App).mount('#app')
```

Migration note: infographic rendering is now explicit opt-in. If your app previously relied on charts working automatically after installing `@antv/infographic`, keep the package installed and add the loader setup above.

## 2. Example

Use the `infographic` code block in Markdown to render charts:

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

## 3. Resources

- [AntV Infographic Official Website](https://infographic.antv.vision/) - Explore more chart templates and syntax details.
