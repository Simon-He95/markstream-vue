# 01：接入 Solid CI 与可重复验证

优先级：合并前。基线与共同边界见 [README](./README.md)。

## 问题与目标

根 `vite.config.ts` 排除了 `packages/markstream-solid/test/**` 和 `playground-solid/test/**`，根 typecheck 面向 Vue；`.github/workflows/ci.yml` 没有补跑 Solid 专属检查。当前 CI 绿灯不能证明本次新增的主要代码正确。

部分检查还只验证弱信号：playground 中名为 hydration 的测试实际调用 `render()`；缺 peer 测试主要禁用 loader；浏览器报告以页面文本增长为证据。目标是让检查名称、覆盖范围和实际断言一致，并让维护者在干净 checkout 中重跑。

## 工作队列

1. 核对现有 workflows、包 scripts、JSX 配置与构建依赖，保持 Solid 测试独立编译。接入 Solid 包及 playground 的 typecheck/test/build；先确保 Ubuntu 有完整关卡，其他平台范围依据仓库现有要求说明，不假称跨平台验证。
2. CI 先构建 parser/core 和 Solid，再验证消费端及 SSR。优先复用 pnpm 锁文件和既有安装步骤；避免每个步骤重复安装、无关锁文件升级或不必要地反复构建整个仓库。
3. 将现有 hydration 用例准确改名为客户端 fixture 检查，或升级为真正的 SSR → hydrate 用例。浏览器验证服务端 DOM 身份保留、水合无异常、按钮可用、追加后更新；仅生成 HTML 或搜索 `generateHydrationScript` 不算完成。
4. 增加可重复的 tarball 消费脚本：本地打包 Solid/parser/core，安装到隔离临时目录，分别覆盖可选 peers 存在和真正缺失两种依赖图。验证公开入口、声明、CSS、Worker 子路径及 production build；禁止用源代码 alias 绕过包导出。
5. 把旧诊断中有效的场景迁为正式浏览器回归：完整和分片图表、延迟 runtime 时纯文本可见、真实代码更新与实例保持。测试读取 Shadow DOM 内代码，不能把行号或 shell 存在当作内容成功。
6. 区分 unit mock、真实浏览器、SSR 和包消费证据。失败时保留输入、分片序列、控制台错误、截图和必要时间线，作为 CI artifacts；避免将大量一次性输出提交到源码目录。

## 必须覆盖的断言

- Mermaid、D2、Infographic 对相同完整输入与确定性分片输入最终进入正确 renderer，真实依赖下产生 SVG；不只检查 class。
- runtime 延迟/不可用时，收到的代码持续显示在 fallback 中；runtime 就绪后的普通追加不重建 editor，不丢选区和滚动状态。
- SSR 页面通过 hydrate 接管同一 DOM，并能继续流式更新；不能使用客户端全量 render 代替。
- 真正缺少 peer 的消费者仍能导入和构建，相关内容合理降级；错误不被空 `catch` 吞掉后记作通过。
- filter 匹配正确包且测试数非零。诊断器退出 0 仅代表采样成功，正式测试须有行为断言。

## 验收与范围

本地和 CI 均可按同一组 scripts 执行 Solid 包与 playground 的 typecheck/test/build，Solid SSR 检查、真实 hydration、打包消费和浏览器用例通过。至少通过一个与本次改动相关的受控失败确认新增关卡确实会阻止错误通过，并立即恢复试验改动；不能提交人为失败。

允许修改相关 workflows、scripts、Solid 测试与 fixture 配置；行为缺陷交由计划 02/03 修复。无浏览器或依赖无法取得时记录阻塞，不用静态源码检查代替浏览器验收。不以本计划扩展性能竞赛或全面测试所有框架。
