# cloudBridge

cloudBridge（云端桥接器）是一个独立的 Electron 桌面应用，用于同时运行多个 Cloud Sat 电台实例和通用网络/串口转发任务。前端使用 Vue 3 Options API 与 JavaScript，主进程使用 CommonJS JavaScript。

## 功能

- Cloud Sat 实例：同一监听端口提供 `/media`、`/serial/radio`、`/serial/ptz`、`/serial/sdr`。
- 高级转发：WebSocket→Serial、WebSocket→TCP、TCP→Serial、TCP→TCP；两种串口转发均支持普通串口和 USB CDC。
- 所有实例仅允许本机及直接连接的私有子网访问；支持 IPv4、IPv4 + IPv6 双栈和仅本机监听。
- 多实例独立启动、停止、重启、复制及批量操作；端口、串口和声卡资源冲突检测。
- 协议 v2 设备认证、来源失败限流、单客户端限制、64 KiB 帧上限。
- 48 kHz、单声道、PCM16LE、20 ms 音频帧；隐藏音频窗口与每实例 AudioWorklet 会话。
- DTR/RTS 三种模式、30 ms 串口静默分帧及断开时 DTR→RTS 复位。
- WSS 证书/私钥匹配、有效期校验；密钥通过 Electron `safeStorage` 加密。
- 中英文界面、首次使用向导、托盘后台运行、随系统启动、脱敏支持包。
- 原创 PNG、macOS ICNS、Windows ICO 图标。

## 环境要求

- Node.js 24.22.3（最低 24.22.3，低于 25）
- npm 11.x
- macOS 13+ 或 Windows 10 22H2+

## 安全安装

仓库提交了 `package-lock.json`，直接依赖均固定为精确版本。推荐使用：

```bash
npm run setup:safe
npm run audit:security
```

`setup:safe` 首先以 `--ignore-scripts` 按锁文件哈希安装全部依赖，随后只运行已审阅的 Electron 官方下载脚本。Electron 下载由包内 `checksums.json` 校验。`serialport` 和 `esbuild` 在支持的平台通过锁定的预编译包加载，无需开放所有第三方生命周期脚本。

## 开发与验证

```bash
npm run dev
npm run lint
npm test
npm run build
npm run test:e2e
npm run check
```

- `npm test`：配置、密钥、资源租约、认证、音频帧、串口控制线、运行时和 Vue 契约测试。
- `npm run test:e2e`：构建后启动真实 Electron，完成首次向导、新建 TCP→TCP 实例、监听连接、启动与停止流程。
- `npm run check`：顺序执行 lint、单元/集成测试、生产构建和 Electron E2E。

## 运行

```bash
npm run build
npm start
```

首次运行会显示后台运行和局域网安全说明。关闭主窗口默认缩至托盘；从托盘选择“Quit”会停止全部实例并释放网络、串口和音频资源。

普通配置保存在 Electron `userData/config.json`，加密密钥保存在 `userData/secrets.json`，日志保存在 `userData/logs/bridge.log`。运行状态不会写入配置。

应用以 `cloudBridge` 作为名称，使用独立的用户数据目录；测试时可通过 `CLOUD_BRIDGE_USER_DATA` 指定临时目录。
本次为首次发布前改名，旧 Cloud Sat Bridge / cloud-sat-bridge 的本地数据不自动迁移，也不会被删除。
旧密钥使用系统安全存储加密，改名后不应直接复制 `secrets.json`；如需沿用旧配置，请先从旧版记录配置，再在新版重新设置设备密钥及导入 TLS 证书。

## 打包

```bash
npm run pack
npm run dist:mac -- --arm64
npm run dist:mac -- --x64
npm run dist:win
npm run dist:mas
npm run dist:msix
```

- `pack` 生成当前平台的未签名目录包，用于本地打包验证。
- `dist:mac` 在 macOS 上生成 DMG 和 ZIP；按设备选择 `--arm64`（Apple 芯片）或 `--x64`（Intel）。
- `dist:win` 在 Windows x64 上生成 NSIS EXE 安装包。
- GitHub 下载版使用独立的 `electron-builder.github.yml`：macOS 为临时签名、未公证的测试包，Windows 为未签名测试包；不需要商店签名凭据。正式分发前需配置受信任签名及 macOS 公证。
- `dist:mas` 需要有效的 Apple Developer/Mac App Store 签名证书和描述文件。
- `dist:msix` 应在 Windows x64 签名环境中运行，并在提交前执行 Windows App Certification Kit。

图标源文件是 `build/icon-source.png`；运行 `npm run icons` 可从 `build/icon.iconset` 重新生成 `build/icon.icns` 与 `build/icon.ico`。

## GitHub 自动构建与 Release

`.github/workflows/build.yml` 在 macOS arm64、macOS Intel 和 Windows x64 上分别安装锁定依赖并执行完整检查。
GitHub 构建使用官方 npm、Electron 和构建工具下载源，本地镜像配置不变。

- 提交到 `main` 或创建针对 `main` 的 Pull Request：只执行检查。
- 在 Actions 中选择 **Build and draft release → Run workflow**：检查、打包并测试打包后的应用；安装包在该次运行的 Artifacts 中保留 14 天，不创建 Release。
- 推送 `v*` 标签：检查、打包、测试打包后的应用；三个平台全部成功且五个安装包齐全后，生成 `SHA256SUMS.txt` 并创建 Release 草稿。包含预发布版本号的标签会标记为 pre-release。

版本标签必须与 `package.json` 的版本完全一致，例如版本 `0.1.0` 对应标签 `v0.1.0`。
先提交版本修改，再创建并推送标签：

```bash
git tag v0.1.0
git push origin main
git push origin v0.1.0
```

首次使用前需创建 GitHub 仓库并将其配置为 `origin`。工作流使用仓库自动提供的 `GITHUB_TOKEN`，无需个人访问令牌；仅 Release 任务有写权限。
下载草稿中的安装包，完成安装和真实设备测试后，在 GitHub Releases 中手动选择 **Publish release**。
重跑只允许更新同版本的草稿，不会覆盖已公开版本的安装包。
安装包和构建目录不提交到 Git，证书、密码也不写入源码；未来接入正式签名时使用 GitHub Actions Secrets。

## USB CDC 串口转发

创建或编辑 WebSocket→Serial、TCP→Serial 实例时，在“串口”中选择系统识别到的 USB CDC 设备，将“连接模式”设为“USB CDC（原生 USB 串口）”，按设备要求填写波特率并保存。Cloud Sat 电台的串口也使用相同设置。

CDC 模式在客户端连接、打开串口后依次置高 RTS、DTR；客户端断开或实例停止时依次复位 DTR、RTS。普通串口模式在打开时将两条控制线置低；不需要控制线的设备可选择“不控制 DTR/RTS”。

## 安全边界

- 主窗口和隐藏音频窗口均启用 `contextIsolation` 与 `sandbox`，禁用 `nodeIntegration`。
- preload 只暴露冻结后的业务 API，不提供通用 IPC、文件系统、进程或 Socket 访问。
- 麦克风权限只授予隐藏音频窗口，并仅在音频测试或启动音频会话时请求。
- 默认要求设备认证；在非回环地址关闭认证时界面会再次确认。
- 日志不记录设备密钥、TLS 私钥或音频内容；支持包会再次脱敏。

更细的完成情况和未进行的硬件/商店验收见 [实现状态](docs/IMPLEMENTATION_STATUS.md)。

## 局域网访问边界

四种高级转发模式保留原始 TCP / WebSocket 数据协议，不需要新增密钥握手。
Cloud Sat 电台和四种高级转发模式均仅允许本机回环地址及当前网卡直接连接的私有子网访问：IPv4 使用
10.0.0.0/8、172.16.0.0/12、192.168.0.0/16，IPv6 使用 ULA（fc00::/7），
并且来源必须与本机某个私有网卡处于同一子网。多网卡及 VPN 私有子网均包含在内。
网卡信息在每次新连接时读取，识别失败时只允许本机。旧实例同样受此限制。

所有实例的监听菜单显示“仅局域网 IPv4”“仅局域网 IPv4 + IPv6”及两个仅本机选项。
底层通配监听地址仍是 0.0.0.0 / ::，但主进程会在建立连接及升级 WebSocket 之前检查来源。
Cloud Sat 的 `/health`、`/media`、`/serial/radio`、`/serial/ptz`、`/serial/sdr` 均受限制，
关闭设备认证也不会取消局域网限制；协议 v2 的设备认证设置继续生效。

TCP→Serial、TCP→TCP 使用普通 TCP，传输未加密，编辑器不提供 TLS 配置。
旧 TCP 实例中未生效的证书关联在配置加载及保存时清除，启动时也不会读取相应私钥。
Cloud Sat 和 WebSocket 实例继续支持 TLS/WSS；WebSocket→TCP 的 TLS 仅作用于 WebSocket 监听端，远端 TCP 连接仍为明文。

高级 WebSocket 实例的“允许的网页来源”每行配置一个完整来源，精确匹配协议、主机和端口。
默认值为 https://ptz.cloudsat.cn、https://m.cloudsat.cn、https://mapp.cloudsat.cn 和
app://cloudsat。其他来源、通配符和字面值 null 不被接受。留空表示拒绝所有带 Origin
的客户端；原生客户端可以不发送 Origin，但仍接受局域网检查。旧配置自动补充默认列表。
Origin 是浏览器来源限制，不能作为原生客户端的身份认证。

允许子网内的设备仍可操作转发目标。代理、VPN、隧道及路由器端口映射可能改变服务看到的
来源地址；程序不信任 X-Forwarded-For 等代理头，也无法识别来源已被改写的公网请求。
请同时配置系统和路由器防火墙，不向不可信设备开放该子网。已有连接在网卡变化后保留到断开，
新连接按最新网卡信息检查。

## 资源与会话保护

- 每实例最多 64 个底层连接，包括等待升级和认证的连接。
- 每连接发送积压最多 1 MiB；串口待处理工作最多 1 MiB / 256 项，WebSocket 单帧最多 64 KiB。
- TCP 使用 pause / drain 恢复读取；超过上限关闭对应连接，不静默丢弃串口或 TCP 数据。
- 音频跨进程播放、采集有消费确认，最多积压 1 MiB / 256 项；音频播放缓冲仍采用有限队列。
- 每实例最多 16 个待认证连接，每来源最多 4 个；60 秒内的失败与在途认证合计最多 8 次。
  失败记录不因其他连接成功而清空，停止实例引发的取消不计入失败。
- 停止先取消认证和初始化，再清理设备；WebSocket 关闭握手最多等待 1 秒。
  音频清理必须得到引擎确认，超过 12 秒将销毁共享音频引擎并通知其他音频会话，确保释放麦克风。

## 安全版本与发布限制（2026-11-16）

开发和构建使用 `.nvmrc` 指定的 Node.js 24.22.3（不修改系统全局 Node.js）。
依赖以精确版本及 lockfile 固定，安全审计使用 npm 官方注册表。

Electron 官方发布页列出了 45.3.3，但实施时 npm 官方版本查询及包地址返回 404。
经用户确认暂用可安装的 Electron 45.3.2；其内置 Node.js 为 24.22.2，尚未达到计划的
24.22.3。因此本次不能视为内置 Node.js 安全更新全部完成；45.3.3 可安装后仍需升级、
重新读取运行版本并执行完整验证。仅更新电脑的 Node.js 不会更新 Electron 内置版本。

依赖审计的残余条目及验收边界见 [安全验证记录](docs/SECURITY_VALIDATION.md)。

## 许可证

本项目采用 [ISC 许可证](LICENSE)，允许商业使用、修改和再分发，需保留版权声明及许可声明。
第三方依赖遵循各自的许可证。
