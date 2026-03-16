# AntV Infographic

`markstream-vue` supports rendering [AntV Infographic](https://infographic.antv.vision/) charts.

## 1. Installation

This feature depends on the `@antv/infographic` library.

```bash
npm install @antv/infographic
```

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

## 4. Special props

- Fullscreen dialog z-index: `headerBtnZIndex`