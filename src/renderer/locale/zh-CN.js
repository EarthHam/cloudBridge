export default {
	app: {subtitle: "云端桥接器"},
	nav: {dashboard: "实例", certificates: "TLS证书", logs: "日志与诊断", settings: "设置"},
	onboarding: {title: "连接你的卫星电台", description: "在一个独立应用中管理多个 Cloud Sat 电台和通用转发任务。", instancesTitle: "独立实例", instancesBody: "每个电台使用自己的端口、凭据和硬件资源。", backgroundTitle: "后台运行", backgroundBody: "关闭主窗口时应用默认保留在系统托盘中。", securityTitle: "局域网安全", securityBody: "默认启用设备认证；只在可信网络中关闭认证。", continue: "开始使用"},
	dashboard: {title: "桥接实例", description: "同时运行多个电台、声卡和网络转发任务。", emptyTitle: "还没有桥接实例", emptyDescription: "从上方选择一种模板创建第一个实例。", clients: "客户端", removeConfirm: "确定删除这个实例吗？运行中的实例会先停止。"},
	actions: {start: "启动", stop: "停止", restart: "重启", edit: "编辑", duplicate: "复制", remove: "删除", startAll: "全部启动", stopAll: "全部停止", save: "保存", saving: "保存中…", cancel: "取消", testAudio: "测试音频设备", refresh: "刷新", qrCode: "连接码", copy: "复制地址"},
	status: {stopped: "已停止", starting: "启动中", running: "运行中", degraded: "部分异常", stopping: "停止中", error: "错误"},
	kinds: {cloudsat: "Cloud Sat电台", "websocket-serial": "WebSocket → Serial", "websocket-tcp": "WebSocket → TCP", "tcp-serial": "TCP → Serial", "tcp-tcp": "TCP → TCP"},
	kindDescriptions: {cloudsat: "音频、电台、云台和SDR", "websocket-serial": "WebSocket客户端访问本机串口", "websocket-tcp": "WebSocket与远端TCP互通", "tcp-serial": "TCP客户端访问本机串口", "tcp-tcp": "本地TCP端口转发到远端TCP"},
	editor: {plainTcp: "普通 TCP，传输未加密", cloudLanOnly: "Cloud Sat 电台仅允许本机及当前网卡的私有子网（包括 VPN）连接；设备认证设置仍然生效。", lanOnly: "高级转发仅允许本机及当前网卡的私有子网（包括 VPN）访问，无设备密钥认证。代理、隧道或端口映射可能改变来源地址，请同时配置防火墙。", originsHelp: "每行一个完整来源（协议、主机、端口），不支持通配符。留空将拒绝所有带 Origin 的客户端；原生客户端可不发送 Origin。", createTitle: "新建实例", editTitle: "编辑实例", general: "基本设置", authentication: "设备认证", audio: "音频", forwarding: "转发目标", authWarning: "关闭认证只适用于可信局域网。", audioTestSuccess: "音频输入和输出设备测试成功。", insecureConfirm: "此实例将监听局域网且不要求认证。确定保存吗？", restartConfirm: "保存会停止并重新启动当前实例。确定继续吗？"},
	fields: {allowedOrigins: "允许的网页来源", name: "实例名称", bindHost: "监听地址", listenPort: "监听端口", tls: "TLS配置", noTls: "不使用TLS", autoStart: "随应用自动启动", deviceId: "设备码", deviceSecret: "设备密钥", keepSecret: "留空表示保持不变", requireAuth: "要求设备认证", audioInput: "输入声卡", audioOutput: "输出声卡", selectDevice: "请选择设备", serialPort: "串口", baudRate: "波特率", connectionMode: "连接模式", remoteHost: "远端TCP地址", remotePort: "远端TCP端口"},
	serialModes: {serial_bridge: "普通串口", native_usb_cdc: "USB CDC（原生 USB 串口）", no_control_lines: "不控制 DTR/RTS", cdcHelp: "选择系统识别到的 USB CDC 串口。连接后依次置高 RTS、DTR，断开时依次复位 DTR、RTS。"},
	bindHosts: {lanDualStack: "仅局域网 IPv4 + IPv6 (::)", lanIpv4: "仅局域网 IPv4 (0.0.0.0)", dualStack: "所有 IP（IPv4 + IPv6）(::)", allIpv4: "所有 IPv4 (0.0.0.0)", localIpv6: "仅本机 IPv6 (::1)", localIpv4: "仅本机 IPv4 (127.0.0.1)"},
	bridges: {radio: "电台串口", ptz: "云台串口", sdr: "SDR串口"},
	certificates: {title: "TLS证书", description: "导入可信证书和对应私钥，供多个WSS实例复用。", import: "导入证书", empty: "尚未导入TLS证书。", unknownExpiry: "有效期未知", removeConfirm: "确定删除此TLS配置吗？"},
	logs: {title: "日志与诊断", description: "日志不会包含设备密钥和音频内容。", export: "导出支持包", exported: "已导出", empty: "暂无日志。"},
	settings: {title: "应用设置", description: "配置语言和后台运行行为。", language: "界面语言", launchAtLogin: "随系统登录启动", closeToTray: "关闭主窗口时缩至托盘", saved: "设置已保存", version: "版本"}
}
