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
| 完成态恢复慢于 Vue 3 | Vue 3 在 final 且无外层虚拟滚动协调时直接恢复全文；Solid 仍强制分批。对齐完成态、连续追加、fragment 和 live-window 的启用条件，保留真正需要的分批路径。 |
| 真正分批恢复吞吐偏低 | 激进减半使批次长期过小，idle 回调后仍附加定时器。采用与 Vue 3 一致的预算阈值、0.8 / 1.2 调节及四分之一批量下限，idle 回调直接提交。 |
| JSON diff / pre → highlight 回退 | 未变更行折叠以及末尾空行交接缩短代码体。保留实际测量的流式高度；替换内容、字体、主题和用户展开/折叠时释放，避免阻挡主动布局变化。 |
| Mermaid 预览回退 12px | 源码面板未使用预览的高度上限，多出 padding 所占高度。两种面板使用相同 maxHeight，源码超出后内部滚动。 |
| 输入结束后不追随流尾 | ResizeObserver 只在传输 running 时追随，忽略 final 后仍在进行的平滑渲染与重型组件收尾。保持底部追随直到完成态布局稳定，用户主动滚走仍释放锚点。 |
| 示例图加载失败 | Solid 静态目录缺少 SVG，返回 SPA HTML；另一张图依赖外站，此外标题 `Image` 被普通文本的标签匹配误路由为自定义图片。复用 Vue playground 静态目录，把 Vue PNG 随共享样例打包，完整 URL 前不发起加载；仅对 HTML 节点按 tag 匹配组件，保留 typed 自定义节点元数据。 |

## 覆盖方式

生产脚本 `scripts/e2e-solid-playground.mjs` 自动完成：

- 对标题 1–6、段落、行内格式、列表、引用、代码、图片、表格、checkbox、emoji、reference、footnotes、admonition、vmr container、HTML、数学及图表 header 的代表性 AST，比较 CSS 计算值。
- 明亮英文、深色中文、明亮中文、窄屏中文四个状态；比较字体、行高、颜色、背景、margin/padding、边框、布局、换行及其他列出的属性。缺失节点也会失败。
- 图表文字按钮保持单行；中文模式与操作标签来自 scoped provider。
- 具名 KaTeX worker 确实收到 block 与 inline render；数学单测检查成功路径不调用主线程 renderer、旧请求取消与结果去重、错误回退和缓存。
- 原生浏览器中的文本选区跨追加和渐显收尾保持；单测还覆盖选中增量片段时延迟更新。
- 默认 playground 连续三轮完整播放，保存 rAF、内容高度、滚动回退及 Long Tasks 记录。门禁要求零滚动回退、两张本地图像解码成功，并限制大主线程停顿。
- streaming、替换／清空／恢复／续流、3,000 节点窗口与全量恢复、SSR/hydration、HTML sandbox、图表操作和八组性能场景；额外的外层协调场景要求双方确实分批并落地全部 1,000 节点。

Vue 基线同时加载基础 CSS，使用匹配的 KaTeX / Mermaid worker 和高亮池配置。旧版未完整加载这些配置的对比结果由本轮数据替代。性能数据区分同步更新、端到端落地和帧间隔。原 restore-batched 场景保持原输入与选项，另加 restore-progressive 来验证双方真正执行分批，不把完成态立即恢复误记为分批吞吐。

## 数据与限制

完整 CSS、worker 消息和播放轨迹由脚本写入 `.tmp/solid/`，CI 的 `solid-validation` artifact 保留这些文件和截图。仓库保留本轮性能与组件摘要，见 [VALIDATION.md](./VALIDATION.md)。

这套门禁覆盖指定 AST、选项和交互状态。自定义组件、宿主覆盖 CSS、自定义字体与任意文档组合仍需要在宿主应用验证。默认示例在流式过程中保留已展示代码体的测量高度，完成态交接不再缩短页面；主动折叠、展开和字体调整仍生效。零回退门禁只适用于该固定输入、设置和视口，不能代表所有宿主样式与任意输入。

Solid playground 的线上地址按 Svelte 的方式配置为 `https://markstream-solid.pages.dev/`；目前尚未部署，本地入口为 `http://localhost:4178`。

本轮三次默认完整播放均零回退、无失败图片；普通完成态恢复和真正分批恢复分别测量。最新数字与修复前生产基线见 [VALIDATION.md](./VALIDATION.md)，三轮播放原始数据见 [playbacks.json](./benchmarks/playbacks.json)。
