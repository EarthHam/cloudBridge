const path = require("node:path")
const {app, session} = require("electron")
const {AudioHost} = require("../../../src/main/audio/AudioHost.cjs")

app.setPath("userData", process.env.CLOUD_BRIDGE_USER_DATA)
app.commandLine.appendSwitch("use-fake-device-for-media-stream")
app.commandLine.appendSwitch("use-fake-ui-for-media-stream")
app.on("window-all-closed", () => null)
app.whenReady().then(async () => {
	session.defaultSession.setPermissionRequestHandler((_contents, permission, callback) => callback(permission === "media"))
	const host = new AudioHost({appRoot: path.resolve(__dirname, "../../.."), log: {info() {}, warn() {}, error() {}}})
	let exitCode = 0
	try {
		await host.ensureWindow()
		await host.window.webContents.executeJavaScript(`void (() => {
			const BaseAudioContext = window.AudioContext
			window.AudioContext = class extends BaseAudioContext { constructor(options) { super({...options, sinkId: {type: "none"}}) } }
		})()`)
		let captures = 0
		const errors = []
		const controller = new AbortController()
		const audio = await host.openSession({instanceId: "synthetic", inputDeviceId: "default", outputDeviceId: "", signal: controller.signal, onCapture: () => { captures++ }, onMetrics() {}, onError: error => errors.push(error.message)})
		for (let index = 0; index < 10; index++) audio.play(Buffer.alloc(1920))
		await new Promise(resolve => setTimeout(resolve, 200))
		if (audio.pendingPlaybackItems !== 0) throw new Error("Audio worklet did not acknowledge playback")
		controller.abort(); await audio.close()
		const stoppedAt = captures
		await new Promise(resolve => setTimeout(resolve, 200))
		if (host.sessions.size || errors.length || captures !== stoppedAt) throw new Error(`Audio cleanup failed: ${JSON.stringify({sessions: host.sessions.size, errors, captures, stoppedAt})}`)
		console.log(JSON.stringify({audioSmoke: "passed", playbackAcknowledged: true, sessions: host.sessions.size, captures, electron: process.versions.electron, node: process.versions.node}))
	} catch (error) { console.error(error); exitCode = 1 }
	finally { await host.close(); app.exit(exitCode) }
})
