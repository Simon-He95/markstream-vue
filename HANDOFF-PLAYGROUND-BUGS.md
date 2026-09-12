# Solid Playground：图表分发与代码流式空白问题交接

日期：2026-09-10。诊断基线：`53f8639b`（`feat: add Solid playground`），分支 `main`。用户要求尝试复现并交接给其他人修复；本轮没有修改 renderer 或 playground 实现，也没有提交代码。

## 结论与证据范围

1. **已复现图表在流式输入后仍被当成代码块。** 固定逐字符输入下，Mermaid、D2、Infographic 均留在普通 `CodeBlockNode`。最终保存的对照中，相同完整输入一次性传入时三者均能生成 SVG，因此不能概括成整个包没有图表支持。
2. **已确认代码 fallback 不响应内容更新。** `PreCodeNode` 从空代码挂载，再更新为非空代码，DOM 仍为空。真实代码 runtime 已加载时的直接组件对照能持续更新；“所有代码块都有固定一秒延迟”不能由当前证据支持。延迟加载、fallback 切换和真实首页体验需要结合时间线判断。
3. **首页 D2 fallback 仍需回归核对。** 随机分片下 D2 偶尔能进入专用组件，但首页截图在观察时仍显示源码；第一次静态试跑也未在短窗口内出图，最终保存的静态对照已成功生成 SVG。不能据此宣称 D2 完全不可用，也没有足够证据认定额外根因；修好分发后仍须验证真实首页的加载、流式更新和收敛。
4. **D3 与 D2 分开处理。** 当前分发器识别 `mermaid`、`d2`/`d2lang`、`infographic`，没有内置 `d3` 模式。`d3` 围栏走普通代码块是当前能力边界；不要把本次修复扩张为自动执行任意 D3 JavaScript。用户若确实指 D3，后续应取得其具体输入并确认预期。

本轮使用真实浏览器访问已运行的 Vite dev 服务 `http://127.0.0.1:4177/`。先用 agent-browser 检查页面，再用 Playwright Chromium `151.0.7922.34` 采集可重复的对照与时间线；本机 `stream-diffs` 为 `0.0.2`。没有验证 production build、其他浏览器兼容性或执行全仓测试；不能把本报告作为这些检查的通过证明。

证据和复现工具在 [diagnostics/solid-playground-2026-09-10](./diagnostics/solid-playground-2026-09-10/)：

- [reproduce.mjs](./diagnostics/solid-playground-2026-09-10/reproduce.mjs)：真实 UI 操作和隔离组件对照，无实现源码修改。
- [results.json](./diagnostics/solid-playground-2026-09-10/results.json)：浏览器版本、页面状态、错误和逐次采样数据。
- [home-diagrams.png](./diagnostics/solid-playground-2026-09-10/home-diagrams.png)：首页图表流式演示截图。
- [home-code.png](./diagnostics/solid-playground-2026-09-10/home-code.png)：首页代码实例演示截图；延迟判断请看时间线，不能仅凭终态截图。

## Case 1：图表模式在首次挂载时被固定

### 手动复现

1. 在仓库用 `pnpm play:solid` 启动 dev 服务；已有服务时复用，不结束别人的进程。
2. 打开 `/`，选择“图表与公式”，保留 Balanced / ReadableStream / Pure Random。
3. 等到所有内容传输完成，观察 Mermaid、D2、Infographic。错误表现为普通代码工具栏、语言标题、空白或源码，而不是图表预览。
4. 随机分片可能让 D2 偶尔正确进入 D2 组件，因为较短的语言标识可能在首次挂载时已完整；这不代表根因不存在。使用下面的固定分片可消除随机性。

### 确定性对照

对相同 `NodeRenderer`，关闭 `smoothStreaming`、`typewriter`、`fade`、`batchRendering`。分别从空串每 10ms 追加一个字符，以及初次直接传入完整文档；末尾再等待 2200ms。Mermaid 最小输入为：

````markdown
```mermaid
flowchart LR
 A --> B
```
````

| 输入 | 一次性完整输入 | 逐字符输入 |
| --- | --- | --- |
| Mermaid | Mermaid 专用组件，1 个 SVG | 普通 code block，0 个 SVG |
| D2：`A -> B` | D2 专用组件，2 个 SVG 元素（包含嵌套 SVG，不代表两张图） | 普通 code block，0 个 SVG |
| Infographic：两个 item 的 list-row 样例 | Infographic 专用组件，1 个 SVG | 普通 code block，0 个 SVG |
| D3 围栏 | 普通 code block | 普通 code block；当前无专用 renderer |

精确样例在复现脚本中。浏览器也出现了 `resolveLanguage: "d2" not found in bundled or custom languages`、`"infographic"`、`"d3"` 的未处理错误。错误列表来自整轮诊断，不代表每条都发生于首页；错误语言进入代码高亮链路是需要跟进的降级问题。

### 根因定位：有源码与行为交叉证据

- `packages/markstream-solid/src/components/NodeOutlet.tsx:31` 创建普通 `builtins` 对象，`:51` 在初始化时执行 `codeMode()` 并存下组件类型。
- `:74` 虽然响应式读取 `type()`，`builtins.code_block` 自身却不会因语言变化重新选择。
- `components/RenderChildren.tsx` 用 `Index` 维持位置槽位。流式围栏语言经历空值/前缀/完整名称时，复用旧 owner 是预期行为，但被初始化固定的图表选择不随 props 更新。
- `src/nodeOutletHelpers.ts:7` 的模式解析本身包含正确的图表映射；首要问题不在漏写 Mermaid import 或没有安装 peer。

修复方向：把依赖语言及 context 的组件选择放回响应式计算，保留稳定组件身份；只在实际模式或类型改变时切换 renderer。不要以每个 token 改 key、重建整棵树解决，也不要把未完成语言一律提前映射成图表。验证 `renderCodeBlocksAsPre` 动态切换及自定义 language/scoped renderer 的优先级。

## Case 2：代码块空白等待与批量出现

### 已确认的最小失败

直接挂载 `PreCodeNode`，初始 node 为 `{ type: 'code_block', language: 'ts', code: '', loading: true }`。保持同一组件，只将响应式 node 改为 `{ ..., code: 'const after = 123;', loading: false }`，100ms 后查询 `pre code`：实际 `textContent === ''`，预期为完整代码。

此外，禁用可选 runtime 后，直接向 `CodeBlockNode` 每 20ms 追加两个字符，共输入 207 字符，结束后再等待约两秒：fallback 一直为空。这个对照不依赖代码高亮的加载速度，也不依赖 Markdown parser。

### 根因定位：确定的 fallback 缺陷

`packages/markstream-solid/src/components/Nodes.tsx:54` 的 `PreCodeNode` 在组件初始化时计算 `code`、`isDiff`、`lines`、`showGutter` 和 `width`，JSX 后续读取的是固定值。Solid 组件函数不会像 React 那样为每次 props 更新重跑，因此初始空串会一直保持为空，非空初始内容则可能保持旧内容和旧行号。

`components/CodeBlockNode.tsx` 初始 `fallback=true`；运行时加载和语言前缀等待期间使用此组件，成功更新 editor 后才 `setFallback(false)`（约 `:231`）。因此等待期的代码可能实际已到达，却被不更新的 fallback 隐藏；切换 editor 时才一次看到积累的内容。

修复方向：让 fallback 内容、行数、行号开关及 gutter 宽度随 props 更新，保证 runtime 加载期间立即显示最新纯文本。保持现有节点与选区策略；不要把所有代码永远降级成 pre，也不要用定时重挂载掩盖问题。

### 本次保存的时间线

| 场景 | 实际采样结果 | 解释边界 |
| --- | --- | --- |
| 首页点击“代码块实例保留” | 点击后 1901ms 出现空 shell，2301ms 首次出现 `export const table`，随后逐段更新 | 空 shell 持续约 400ms；这段时间包含围栏/语言输入，不是纯 runtime 加载耗时，也没有证明普遍固定一秒 |
| 已加载 runtime 的两次直接组件试验 | 25ms / 23ms 采样到 `co`，当时输入 2 字符；之后持续变化 | 排除了“每个代码块都固有一秒等待”的断言，不是冷缓存测量 |
| 人为延迟 loader 1000ms | 1033ms 首次出现代码，此时输入累计 98 字符，一次显示约六行内容 | 确定复现 fallback 不更新与延迟加载组合产生的批量出现；不把注入延迟当作用户现场实测 |
| runtime 禁用 | 输入 207 字符后继续观察，约 4175ms 时仍无代码文本 | 降级路径本身就失败，不只是高亮慢 |

`results.json.homeCode` 和各 scenario 的 `trace` 保存完整采样。代码 runtime 使用 Shadow DOM，脚本递归采集其中的文本；行号和空白可能混入，判定“代码出现”时应查字母/实际代码，不能用任意非空文本计数。

### 不能提前下结论的部分

- 直接组件对照中，已加载的真实 `stream-diffs` 能在数十毫秒级采样中出现代码并持续更新，未复现一个固定一秒的等待。复现脚本里的 `real-first-probe` 和 `real-repeat` 都发生在其他页面/图表操作之后，不能称为冷缓存测试。
- `delayed-loader-1000ms` 是主动注入一秒 loader 延迟的隔离实验，使用真实 runtime，但延迟是人为设定。它用于证明 fallback 缺陷如何造成“先空白，后批量出现”，不能证明用户环境天然耗时恰好一秒。
- `CodeBlockNode.tsx:159` 强制 `stream:false`；真实 `stream-diffs@0.0.2` 因此走静态 surface 更新路径。`:205` 每轮内容变化等待 `setTheme`，`:210` 至 `:224` 在 await 创建 editor 成功后才设置 `editorKind`。较慢初始化期间的 generation 失效、重复创建和主题工作值得计数排查，但本轮未证明它们就是固定延迟的直接原因。
- 首页 `HomePage.tsx` 的 `rendererContent` 在 `isStreaming=false` 时改读完整 `sourceContent`；“Stop 后突然显示剩余全文”还可能来自这条页面逻辑，须与自动播放时代码块的等待分开测试，不能混作同一证据。

## 接手后的修复与验收顺序

1. 核对当前 HEAD/工作区，重跑复现工具，先保存本轮结果再生成新结果，避免丢失修复前证据。
2. 先为 `NodeOutlet` 的语言前缀收敛和 `PreCodeNode` 的 props 更新增加会失败的行为测试，再做最小修复。
3. 重新跑同一组静态/逐字符图表输入。Mermaid、D2、Infographic 最终必须进入正确 renderer；在真实 peers 下生成 SVG，不能只检查 class 或 mock 调用。
4. 回归 D2 首页 fallback：增加合理的等待上限，记录 loader、compile、render 的开始/结束、错误、Worker/WASM 请求；与已通过的静态输入对照。不要先假设只是冷启动，也不要在没有数据时宣称 loader 失败。
5. 分开测代码首次加载、相同语言第二块、不同语言、延迟 loader、缺 peer、暂停/恢复、final 和 reset。记录“输入非空时间 → fallback 非空时间 → editor 首次可见时间 → 后续更新”，包含 Shadow DOM，排除只出现行号而无代码的假阳性。
6. 如 fallback 修好后仍有明显等待，再对 `getStreamDiffsRuntime`、`setTheme`、`createEditor`、`updateCode` 做耗时与创建次数记录，定位取消/重建/高亮开销；不要先猜一个 debounce 数值修改。
7. 验证稳定身份、选区、滚动、图表过期结果取消、卸载清理和未知语言降级。正常追加不应重建 editor；错误语言不能持续抛未处理异常。
8. 执行 Solid 包与 playground 的 typecheck/test/build，并按改动范围做仓库回归与生产预览。更新对应验证报告，记录实际复现与修复证据，不沿用此前“首页能打开/文本变长”作为图表和代码流式正确的证明。

必须补的用例包括：语言从空/`m`/`mer` 到 `mermaid`，`d` 到 `d2`，`info` 到 `infographic`；同类型代码块替换语言；`renderCodeBlocksAsPre` 切换；fallback 空到非空、增加行数与跨行号位数、reset；loader 延迟或不可用时持续可见的文本更新；真实 runtime 稳定追加。不要只检查最终内容一致。

## 运行复现工具

```sh
# 终端一：若已有 4177 服务则复用
pnpm play:solid

# 终端二：仓库根目录
node diagnostics/solid-playground-2026-09-10/reproduce.mjs
```

脚本依赖仓库的 `playwright-core`；默认 Chromium 路径是本机 `/home/akrc/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`，可用 `SOLID_DIAG_CHROME` 覆盖，地址可用 `SOLID_DIAG_ORIGIN` 覆盖。Vite `/@fs/` 导入路径也包含当前仓库绝对路径，搬到其他机器时需调整脚本中的 `base`。脚本只操作新浏览器上下文、内存中的组件和 loader，并写入诊断证据；不修改应用源码，不结束已有 dev server。结束后浏览器自动关闭。

该脚本当前是诊断器，成功退出表示完成采样，不表示问题已经修好；修复者需要根据以上期望补充正式断言。详细时间线保留在 JSON，单次耗时受机器负载影响，不是性能承诺。

用户只授权本轮诊断和交接。后续收到修复任务时可按上述顺序实施；不要本轮自动提交、推送、发布、部署或引入 D3 执行能力。
