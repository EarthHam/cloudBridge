# 安全验证记录

日期：2026-11-16

## 验证环境与版本

- 构建与测试使用官方 SHA-256 校验后的临时 Node.js 24.22.3，不修改全局环境。
- Electron 采用用户确认的 45.3.2。官方 npm 对 45.3.3 的版本查询、包下载均返回 404。
- **尚未完成的运行时升级**：Electron 45.3.2 内置 Node.js 24.22.2，仍需在 45.3.3 可安装后升级并重新验证。
- Vue I18n 11.4.20、Zod 4.6.7、Vite 7.3.8、Vitest 5.1.0、concurrently 9.2.5。

## 官方依赖审计

使用 `npm audit --json --registry=https://registry.npmjs.org`。
全量结果：0 严重、0 高危、10 中危。条目数包含父包与传递影响，不代表 10 个独立漏洞。

| 包 | 锁定版本 | 风险来源 |
|---|---|---|
| @electron/asar | 4.1.1 | 打包工具链中的 glob / minimatch 传递影响 |
| @vue/test-utils | 2.5.1 | glob 取消后继续文件遍历的传递影响 |
| app-builder-lib | 27.0.0-alpha.8 | 打包工具链中的 glob / minimatch 传递影响 |
| dmg-builder | 27.0.0-alpha.8 | 打包工具链中的 glob / minimatch 传递影响 |
| editorconfig | 3.0.2 | glob 取消后继续文件遍历的传递影响 |
| electron-builder | 27.0.0-alpha.8 | 打包工具链中的 glob / minimatch 传递影响 |
| electron-builder-squirrel-windows | 27.0.0-alpha.8 | 打包工具链中的 glob / minimatch 传递影响 |
| glob | 13.0.7 | glob 取消后继续文件遍历的传递影响 |
| js-beautify | 2.0.3 | glob 取消后继续文件遍历的传递影响 |
| minimatch | 10.2.6 | minimatch 模式放大导致拒绝服务 |

残余风险只在构建、打包或测试工具链中；应用的网络输入不会直接传给这些 glob 模式接口。
触发条件包括：处理攻击者提供的高复杂度匹配模式，或在依赖取消超时的文件遍历中处理不可信文件树。
开发与打包仍应只使用可信源码、文件树和构建参数。

- minimatch 当前 10.x 版本受影响，修复版本要求 11.0.1，不能在原声明范围内更新。
- glob 当前 13.x 版本受影响，公告修复范围超出当前父依赖声明。
- npm 对父依赖的建议包括 electron-builder 降至 25.1.0、@vue/test-utils 降至 2.4.11。
  依照本次约定不自动降级打包器，不强制跨主版本覆盖传递依赖。
- 未使用 `npm audit fix --force` 或强制 overrides；应在上游兼容修复发布后继续升级。

公告：[glob](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4)、
[minimatch](https://github.com/advisories/GHSA-g3hv-75wg-m249)。

## 自动化验证

- `npm run check`：通过；lint 无错误或警告、20 个测试文件共 114 项测试通过、生产构建通过、2 项 Electron E2E 通过。
- 管理界面验证了局域网标签、白名单持久化和升级前的 Origin 拒绝。
- 原生 Electron 音频验证了真实 AudioWorklet 播放确认、跨隔离上下文 MessagePort 传递和关闭确认。
  使用模拟输入和静音输出；采集端队列及迟到媒体流释放另有独立回归测试，不能代替真实硬件验收。
- `npm run pack`：未签名 macOS arm64 目录包和原生串口依赖重建成功。
- 打包后的 macOS 应用通过管理界面 E2E：局域网配置、白名单保存、非法来源拒绝及转发启停。
- 已读取真实 `process.versions`：Electron 45.3.2 / Node.js 24.22.2；原生串口模块加载成功。

## 访问与硬件边界

TCP 模式不提供 TLS 配置，并明确显示传输未加密；历史证书关联在配置加载及保存时清除。
Cloud Sat / WebSocket 仍支持 WSS，WebSocket→TCP 的远端 TCP 通道仍未加密。

Cloud Sat 和高级转发都仅接受本机和直接连接的私有子网；Cloud Sat 的健康检查、音频和三个串口路径均受保护。
Cloud Sat 设备认证独立生效，关闭认证不会取消局域网限制。
高级转发继续允许合法子网内的无密钥原始连接，Origin 也不是原生客户端的身份认证。
来源检查无法识别已被代理或路由器重写为合法内网地址的请求，应配合防火墙使用。
自动化音频测试使用 Chromium 模拟媒体设备，不访问真实麦克风。
真实串口、声卡、网络切换及 Windows 安装包和商店签名仍需在目标环境验收。
