# Vue 3 组件样式、worker 与播放验证

对照入口：`pnpm play:solid` 后打开 `/component-parity`。两列使用同一 AST、相同选项，左侧为 Vue 3，右侧为原生 Solid。可切换主题和翻译。文档接入见 [Solid 指南](https://markstream.simonhe.me/guide/solid)。

## 本轮定位

| 问题 | 原因与修正 |
| --- | --- |
| Mermaid / Infographic header 逐字换行 | Code header 的 26px 图标按钮规则误匹配图表文字按钮。分离图表 header 的标题、模式和操作区；Preview/Source 使用自动宽度及 nowrap，操作按钮使用 SVG。 |
| 模块样式不一致 | 原生节点没有完整使用 Vue 3 的 class / token 契约。字号、行高、颜色、间距和容器 token 已移入公共 core；pre/diff CSS 共用同一文件，补齐 metadata、collapsed/empty 等 markup。 |
| 数学结果反复重建 | math_inline / math_block 原先走通用 RichNode，随 source 重写 innerHTML。改为稳定的原生数学组件，保留上次结果、合并 32ms 流式请求、取消旧 worker 请求并阻止旧结果覆盖。 |
| worker 未实际启用 | 原 playground 没有注入 KaTeX、Mermaid 和高亮池。现在由浏览器入口创建，生产浏览器记录具名 worker 的实际 block/inline render 消息；SSR 不创建 worker。 |
| 渐显不等同 Vue | 原增量 span 没有接上分段动画，更新会重组已显示文本。Vue / Solid 现在共用 core 的分段渐显状态机；Solid 保留已显示文本节点，并验证选择复制。 |
| 流尾经过估算壳 | Solid 只立即渲染首批，缺少 Vue 3 对 live tail 的豁免。流尾现在直接渲染，重型增强仍遵守可见性策略；虚拟窗口与外层协调窗口采用 flow-root。 |
| 启动和图片切换产生额外工作 | 播放器原先以全文初始化，又在 mount 后清空重播。现在从空内容启动，并与 Vue playground 共用固定图片框 CSS。 |
| 富内容流式耗时约 2 秒 | 空／不完整代码就创建编辑器，旧任务等待 visual-ready 会阻塞后续工作。等到首段代码后创建、跳过过时等待，并去重不变的字体／主题设置。 |
| 分批恢复等待过长 | 自适应 batch 只缩小，idle 回调后又完整等待 delay。加入预算内恢复并把已消耗的 idle 等待计入批次间隔。 |

## 覆盖方式

生产脚本 `scripts/e2e-solid-playground.mjs` 自动完成：

- 对标题 1–6、段落、行内格式、列表、引用、代码、图片、表格、checkbox、emoji、reference、footnotes、admonition、vmr container、HTML、数学及图表 header 的代表性 AST，比较 CSS 计算值。
- 明亮英文、深色中文、明亮中文、窄屏中文四个状态；比较字体、行高、颜色、背景、margin/padding、边框、布局、换行及其他列出的属性。缺失节点也会失败。
- 图表文字按钮保持单行；中文模式与操作标签来自 scoped provider。
- 具名 KaTeX worker 确实收到 block 与 inline render；数学单测检查成功路径不调用主线程 renderer、旧请求取消与结果去重、错误回退和缓存。
- 原生浏览器中的文本选区跨追加和渐显收尾保持；单测还覆盖选中增量片段时延迟更新。
- 默认 playground 完整播放，保存 rAF、内容高度、滚动回退及 Long Tasks 记录。门禁限制反复回退与大主线程停顿。
- streaming、替换／清空／恢复／续流、3,000 节点窗口与全量恢复、SSR/hydration、HTML sandbox、图表操作和七组性能场景。

Vue 基线同时加载基础 CSS，使用匹配的 KaTeX / Mermaid worker 和高亮池配置。旧版未完整加载这些配置的对比结果由本轮数据替代。性能数据区分同步更新、端到端落地和帧间隔；分批完成时间更长不等于主线程单帧更长。

## 数据与限制

完整 CSS、worker 消息和播放轨迹由脚本写入 `.tmp/solid/`，CI 的 `solid-validation` artifact 保留这些文件和截图。仓库保留本轮性能与组件摘要，见 [VALIDATION.md](./VALIDATION.md)。

这套门禁覆盖指定 AST、选项和交互状态。自定义组件、宿主覆盖 CSS、自定义字体与任意文档组合仍需要在宿主应用验证。默认示例里的 diff 会折叠未改动行：Vue 与 Solid 都可出现一次对应的高度收缩，报告保留自然折叠引起的变化。

Solid playground 的线上地址按 Svelte 的方式配置为 `https://markstream-solid.pages.dev/`；目前尚未部署，本地入口为 `http://localhost:4178`。
