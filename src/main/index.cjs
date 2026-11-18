const path = require("node:path")
const fs = require("node:fs/promises")
const {randomUUID} = require("node:crypto")
const {app, BrowserWindow, Menu, Tray, dialog, ipcMain, safeStorage, session, nativeImage} = require("electron")
const {SerialPort} = require("serialport")
const {ConfigStore} = require("./config/ConfigStore.cjs")
const {SecretStore} = require("./config/SecretStore.cjs")
const {LogService} = require("./logging/LogService.cjs")
const {ResourceRegistry} = require("./instances/ResourceRegistry.cjs")
const {InstanceManager} = require("./instances/InstanceManager.cjs")
const {AudioHost} = require("./audio/AudioHost.cjs")
const {serializeError} = require("./errors/AppError.cjs")
const {validateTlsMaterial} = require("./security/tlsProfile.cjs")
const {loadTrayIcon} = require("./trayIcon.cjs")

const appRoot = path.resolve(__dirname, "../..")
const developmentUrl = process.env.VITE_DEV_SERVER_URL || ""
let mainWindow = null
let tray = null
let quitting = false
let shutdownStarted = false
let configStore
let secretStore
let log
let audioHost
let instanceManager

if (process.env.CLOUD_BRIDGE_USER_DATA) app.setPath("userData", path.resolve(process.env.CLOUD_BRIDGE_USER_DATA))

const ok = value => ({ok: true, value})
const fail = error => ({ok: false, error: serializeError(error)})
const handle = (channel, operation) => ipcMain.handle(channel, async (event, payload) => {
	try { return ok(await operation(payload || {}, event)) } catch (error) { log?.error(null, `IPC ${channel} failed`, {code: error.code, message: error.message}); return fail(error) }
})

const sendToMain = (channel, value) => {
	if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, value)
}

const createMainWindow = async () => {
	mainWindow = new BrowserWindow({
		width: 1180,
		height: 760,
		minWidth: 900,
		minHeight: 620,
		show: false,
		title: "cloudBridge",
		webPreferences: {
			preload: path.join(appRoot, "src/preload/main.cjs"),
			nodeIntegration: false,
			contextIsolation: true,
			sandbox: true
		}
	})
	mainWindow.once("ready-to-show", () => mainWindow.show())
	mainWindow.on("close", event => {
		if (quitting || !configStore.getSettings().closeToTray) return
		event.preventDefault()
		mainWindow.hide()
	})
	if (developmentUrl) await mainWindow.loadURL(developmentUrl)
	else await mainWindow.loadFile(path.join(appRoot, "dist/index.html"))
}

const createTray = () => {
	const icon = loadTrayIcon({nativeImage, platform: process.platform, appRoot, resourcesPath: process.resourcesPath, isPackaged: app.isPackaged})
	tray = new Tray(icon)
	tray.setToolTip("cloudBridge")
	tray.setContextMenu(Menu.buildFromTemplate([
		{label: "Show cloudBridge", click: () => { mainWindow.show(); mainWindow.focus() }},
		{label: "Start all", click: () => instanceManager.startAll()},
		{label: "Stop all", click: () => instanceManager.stopAll()},
		{type: "separator"},
		{label: "Quit", click: () => { quitting = true; app.quit() }}
	]))
	tray.on("double-click", () => { mainWindow.show(); mainWindow.focus() })
}

const importCertificate = async () => {
	const certificateResult = await dialog.showOpenDialog(mainWindow, {title: "Select TLS certificate", properties: ["openFile"], filters: [{name: "PEM certificate", extensions: ["pem", "crt", "cer"]}]})
	if (certificateResult.canceled) return null
	const keyResult = await dialog.showOpenDialog(mainWindow, {title: "Select TLS private key", properties: ["openFile"], filters: [{name: "PEM private key", extensions: ["pem", "key"]}]})
	if (keyResult.canceled) return null
	const certificatePem = await fs.readFile(certificateResult.filePaths[0], "utf8")
	const privateKeyPem = await fs.readFile(keyResult.filePaths[0], "utf8")
	const {expiresAt} = validateTlsMaterial(certificatePem, privateKeyPem)
	const privateKeyRef = await secretStore.set(privateKeyPem)
	try {
		return await configStore.addTlsProfile({id: randomUUID(), name: path.basename(certificateResult.filePaths[0]), certificatePem, privateKeyRef, expiresAt})
	} catch (error) { await secretStore.remove(privateKeyRef); throw error }
}

const registerIpc = () => {
	handle("instances:list", () => instanceManager.list())
	handle("instances:get", ({id}) => instanceManager.get(id))
	handle("instances:defaults", ({kind}) => instanceManager.defaults(kind))
	handle("instances:create", config => instanceManager.create(config))
	handle("instances:update", ({id, config}) => instanceManager.update(id, config))
	handle("instances:duplicate", ({id}) => instanceManager.duplicate(id))
	handle("instances:remove", ({id}) => instanceManager.remove(id))
	handle("instances:start", ({id}) => instanceManager.start(id))
	handle("instances:stop", ({id}) => instanceManager.stop(id))
	handle("instances:restart", ({id}) => instanceManager.restart(id))
	handle("instances:start-all", () => instanceManager.startAll())
	handle("instances:stop-all", () => instanceManager.stopAll())
	handle("instances:reveal-secret", ({id}) => instanceManager.revealSecret(id))
	handle("devices:list-audio", () => audioHost.listDevices())
	handle("devices:test-audio", config => audioHost.testDevices(config))
	handle("devices:list-serial", () => SerialPort.list())
	handle("certificates:list", () => configStore.getTlsProfiles().map(profile => ({id: profile.id, name: profile.name, expiresAt: profile.expiresAt})))
	handle("certificates:import", () => importCertificate())
	handle("certificates:remove", async ({id}) => { const removed = await configStore.removeTlsProfile(id); await secretStore.remove(removed.privateKeyRef); return {status: true} })
	handle("settings:get", () => configStore.getSettings())
	handle("settings:update", async patch => {
		const settings = await configStore.updateSettings(patch)
		if (Object.hasOwn(patch, "launchAtLogin")) app.setLoginItemSettings({openAtLogin: settings.launchAtLogin})
		return settings
	})
	handle("logs:list", ({limit}) => log.list(limit))
	handle("logs:export", async () => {
		const result = await dialog.showSaveDialog(mainWindow, {title: "Export support bundle", defaultPath: `cloud-bridge-support-${Date.now()}.json`})
		if (result.canceled) return null
		const config = configStore.getConfig()
		config.instances = config.instances.map(instance => ({...instance, secretRef: instance.secretRef ? "[REDACTED]" : undefined}))
		config.tlsProfiles = config.tlsProfiles.map(profile => ({...profile, certificatePem: "[CERTIFICATE]", privateKeyRef: "[REDACTED]"}))
		await fs.writeFile(result.filePath, JSON.stringify({exportedAt: new Date().toISOString(), config, instances: instanceManager.list(), logs: log.list(1000)}, null, 2), "utf8")
		return result.filePath
	})
	handle("app:info", () => ({name: app.getName(), version: app.getVersion(), platform: process.platform}))
	handle("app:show-window", () => { if (mainWindow) { mainWindow.show(); mainWindow.focus() } return {status: true} })
	handle("app:quit", () => { quitting = true; app.quit(); return {status: true} })
}

const initialize = async () => {
	const userData = app.getPath("userData")
	configStore = new ConfigStore(path.join(userData, "config.json"))
	secretStore = new SecretStore({filePath: path.join(userData, "secrets.json"), safeStorage})
	log = new LogService({directory: path.join(userData, "logs")})
	await Promise.all([configStore.load(), secretStore.load(), log.load()])
	audioHost = new AudioHost({appRoot, log})
	instanceManager = new InstanceManager({configStore, secretStore, resourceRegistry: new ResourceRegistry(), audioHost, log, onStatus: value => sendToMain("instances:status", value)})
	log.onEntry(entry => sendToMain("logs:entry", entry))
	registerIpc()
	await createMainWindow()
	createTray()
	app.setLoginItemSettings({openAtLogin: configStore.getSettings().launchAtLogin})
	await instanceManager.startAll({autoOnly: true})
}

if (!app.requestSingleInstanceLock()) app.quit()
else {
	app.on("second-instance", () => { if (mainWindow) { mainWindow.show(); mainWindow.focus() } })
	app.whenReady().then(async () => {
		session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
			callback(permission === "media" && webContents === audioHost?.window?.webContents)
		})
		await initialize()
	}).catch(error => { dialog.showErrorBox("cloudBridge", error.message); app.quit() })
	app.on("before-quit", event => {
		if (shutdownStarted) return
		if (!instanceManager) return
		event.preventDefault()
		quitting = true
		shutdownStarted = true
		const manager = instanceManager
		instanceManager = null
		manager.stopAll()
			.catch(error => log?.error(null, "Unable to stop every instance during shutdown", {message: error.message}))
			.finally(() => audioHost?.close())
			.finally(() => app.exit(0))
	})
	app.on("window-all-closed", () => null)
}
