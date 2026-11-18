const {contextBridge, ipcRenderer} = require("electron")

const toSerializable = payload => payload === undefined ? undefined : JSON.parse(JSON.stringify(payload))

const invoke = async (channel, payload) => {
	const result = await ipcRenderer.invoke(channel, toSerializable(payload))
	if (result && result.ok) return result.value
	const error = new Error(result?.error?.message || "Operation failed")
	error.code = result?.error?.code || "INTERNAL_ERROR"
	error.details = result?.error?.details || null
	throw error
}

const subscribe = (channel, callback) => {
	const listener = (_event, value) => callback(value)
	ipcRenderer.on(channel, listener)
	return () => ipcRenderer.off(channel, listener)
}

contextBridge.exposeInMainWorld("bridgeAPI", Object.freeze({
	instances: Object.freeze({
		list: () => invoke("instances:list"),
		get: id => invoke("instances:get", {id}),
		defaults: kind => invoke("instances:defaults", {kind}),
		create: config => invoke("instances:create", config),
		update: (id, config) => invoke("instances:update", {id, config}),
		duplicate: id => invoke("instances:duplicate", {id}),
		remove: id => invoke("instances:remove", {id}),
		start: id => invoke("instances:start", {id}),
		stop: id => invoke("instances:stop", {id}),
		restart: id => invoke("instances:restart", {id}),
		startAll: () => invoke("instances:start-all"),
		stopAll: () => invoke("instances:stop-all"),
		revealSecret: id => invoke("instances:reveal-secret", {id})
	}),
	devices: Object.freeze({
		listAudio: () => invoke("devices:list-audio"),
		listSerial: () => invoke("devices:list-serial"),
		testAudio: config => invoke("devices:test-audio", config)
	}),
	certificates: Object.freeze({
		list: () => invoke("certificates:list"),
		import: () => invoke("certificates:import"),
		remove: id => invoke("certificates:remove", {id})
	}),
	settings: Object.freeze({
		get: () => invoke("settings:get"),
		update: patch => invoke("settings:update", patch)
	}),
	logs: Object.freeze({
		list: limit => invoke("logs:list", {limit}),
		exportSupportBundle: () => invoke("logs:export")
	}),
	app: Object.freeze({
		getInfo: () => invoke("app:info"),
		showWindow: () => invoke("app:show-window"),
		quit: () => invoke("app:quit")
	}),
	events: Object.freeze({
		onInstanceStatus: callback => subscribe("instances:status", callback),
		onLogEntry: callback => subscribe("logs:entry", callback)
	})
}))

module.exports = {toSerializable}
