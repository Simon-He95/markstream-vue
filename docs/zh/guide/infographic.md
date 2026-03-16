# AntV Infographic

`markstream-vue` 支持渲染 [AntV Infographic](https://infographic.antv.vision/) 图表。

## 1. 安装

该功能依赖 `@antv/infographic` 库。

```bash
npm install @antv/infographic
```

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

## 4. 特殊 props

- 当显示全屏 dialog时 z-index: `headerBtnZIndex`