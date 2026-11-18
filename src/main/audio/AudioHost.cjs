const path = require("node:path")
const {randomUUID} = require("node:crypto")
const {BrowserWindow, MessageChannelMain, ipcMain} = require("electron")
const {MAX_PENDING_BYTES, MAX_PENDING_ITEMS} = require("../../shared/constants.cjs")
const {AppError} = require("../errors/AppError.cjs")

class AudioHost {
	constructor({appRoot, log}) {
		this.appRoot = appRoot
		this.log = log
		this.window = null
		this.readyPromise = null
		this.sessions = new Map()
		this.requests = new Map()
		this.responseHandler = (event, response) => {
			if (!this.window || event.sender !== this.window.webContents) return
			const pending = this.requests.get(response.id)
			if (!pending) return
			this.requests.delete(response.id)
			clearTimeout(pending.timer)
			response.error ? pending.reject(new AppError("AUDIO_DEVICE_ERROR", response.error)) : pending.resolve(response.result)
		}
		ipcMain.on("audio-host:response", this.responseHandler)
	}

	async ensureWindow() {
		if (this.window && !this.window.isDestroyed()) return this.readyPromise
		this.window = new BrowserWindow({
			show: false,
			width: 320,
			height: 240,
			webPreferences: {
				preload: path.join(this.appRoot, "src/preload/audio.cjs"),
				nodeIntegration: false,
				contextIsolation: true,
				sandbox: true,
				backgroundThrottling: false
			}
		})
		const createdWindow = this.window
		this.readyPromise = new Promise((resolve, reject) => {
			this.window.webContents.once("did-finish-load", resolve)
			this.window.webContents.once("did-fail-load", (_event, code, description) => reject(new AppError("AUDIO_HOST_FAILED", `${code}: ${description}`)))
		})
		this.window.webContents.on("render-process-gone", (_event, details) => {
			if (this.window !== createdWindow) return
			this.log.error(null, "Audio renderer stopped", details)
			const error = new AppError("AUDIO_DEVICE_ERROR", "Audio engine stopped unexpectedly")
			for (const session of this.sessions.values()) session.onError(error)
			for (const pending of this.requests.values()) { clearTimeout(pending.timer); pending.reject(error) }
			this.requests.clear()
			this.sessions.clear()
			this.window = null
			this.readyPromise = null
		})
		await this.window.loadFile(path.join(this.appRoot, "src/audio-renderer/index.html"))
		return this.readyPromise
	}

	async request(type, payload = {}) {
		await this.ensureWindow()
		const id = randomUUID()
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				this.requests.delete(id)
				reject(new AppError("AUDIO_HOST_TIMEOUT", "Audio engine did not respond"))
			}, 10_000)
			this.requests.set(id, {resolve, reject, timer})
			this.window.webContents.send("audio-host:request", {id, type, payload})
		})
	}

	listDevices() {
		return this.request("list-devices")
	}

	testDevices(payload) {
		return this.request("test-devices", payload)
	}

	async openSession({instanceId, inputDeviceId, outputDeviceId, onCapture, onMetrics, onError, signal}) {
		if (this.sessions.has(instanceId)) throw new AppError("DEVICE_BUSY", "Audio session is already active")
		if (signal?.aborted) throw new AppError("SESSION_CANCELLED", "Audio session was cancelled")
		const sessionId = randomUUID()
		let port
		let ownerWindow
		let disconnected = false
		let readyResolve
		let readyReject
		let closedResolve
		let timer
		let closeTimer
		let cancelled = false
		let closePromise
		let pendingBytes = 0
		let nextPacket = 0
		const pending = new Map()
		const ready = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject })
		// The startup promise can be cancelled while the hidden window is still loading.
		ready.catch(() => null)
		const closed = new Promise(resolve => { closedResolve = resolve })
		const onAbort = () => { session.close() }
		const session = {
			onError,
			get pendingPlaybackBytes() { return pendingBytes },
			get pendingPlaybackItems() { return pending.size },
			play: data => {
				if (cancelled || !port) return
				if (pendingBytes + data.length > MAX_PENDING_BYTES || pending.size >= MAX_PENDING_ITEMS) {
					onError(new AppError("QUEUE_OVERFLOW", "Audio playback queue is full")); session.close(); return
				}
				const id = nextPacket++
				pending.set(id, data.length)
				pendingBytes += data.length
				const arrayBuffer = Uint8Array.from(data).buffer
				port.postMessage({type: "play", id, data: arrayBuffer})
			},
			close: () => {
				if (closePromise) return closePromise
				cancelled = true
				clearTimeout(timer)
				signal?.removeEventListener("abort", onAbort)
				readyReject(new AppError("SESSION_CANCELLED", "Audio session was cancelled"))
				pending.clear(); pendingBytes = 0
				if (port && !disconnected) {
					try { port.postMessage({type: "close"}) } catch { closedResolve() }
					closeTimer = setTimeout(() => {
						// A hung renderer cannot be allowed to retain microphone resources.
						if (this.window === ownerWindow) {
							for (const item of this.sessions.values()) if (item !== session) item.onError(new AppError("AUDIO_DEVICE_ERROR", "Audio engine cleanup timed out"))
							if (!this.window.isDestroyed()) this.window.destroy()
							this.window = null; this.readyPromise = null
						}
						closedResolve()
					}, 12_000)
				} else closedResolve()
				closePromise = closed.then(() => {
					clearTimeout(closeTimer)
					port?.close()
					if (this.sessions.get(instanceId) === session) this.sessions.delete(instanceId)
				})
				return closePromise
			}
		}
		this.sessions.set(instanceId, session)
		signal?.addEventListener("abort", onAbort, {once: true})
		try {
			timer = setTimeout(() => readyReject(new AppError("AUDIO_DEVICE_ERROR", "Audio device startup timed out")), 12_000)
			await Promise.race([this.ensureWindow(), ready])
			if (cancelled || signal?.aborted) throw new AppError("SESSION_CANCELLED", "Audio session was cancelled")
			ownerWindow = this.window
			const {port1, port2} = new MessageChannelMain()
			port = port1
			port.on("message", event => {
				const message = event.data || {}
				if (message.type === "closed") { closedResolve(); return }
				if (cancelled) return
				if (message.type === "ready") { clearTimeout(timer); readyResolve() }
				else if (message.type === "play-ack" && pending.has(message.id)) { pendingBytes -= pending.get(message.id); pending.delete(message.id) }
				else if (message.type === "capture") {
					try { onCapture(Buffer.from(message.data)) } catch (error) { onError(error); session.close() }
					if (!cancelled) port.postMessage({type: "capture-ack", id: message.id})
				} else if (message.type === "metrics" && onMetrics) onMetrics(message.metrics)
				else if (message.type === "error") {
					const error = new AppError("AUDIO_DEVICE_ERROR", message.message || "Audio device error")
					readyReject(error); onError(error); session.close()
				}
			})
			port.on("close", () => { disconnected = true; closedResolve(); if (!cancelled) { readyReject(new AppError("AUDIO_DEVICE_ERROR", "Audio port closed")); onError(new AppError("AUDIO_DEVICE_ERROR", "Audio port closed")); session.close() } })
			port.start()
			this.window.webContents.postMessage("audio-host:open-session", {instanceId, sessionId, inputDeviceId, outputDeviceId, limits: {bytes: MAX_PENDING_BYTES, items: MAX_PENDING_ITEMS}}, [port2])
			await ready
			if (cancelled || signal?.aborted) throw new AppError("SESSION_CANCELLED", "Audio session was cancelled")
			return session
		} catch (error) { await session.close(); throw error }
	}

	async close() {
		await Promise.allSettled([...this.sessions.values()].map(session => session.close()))
		this.sessions.clear()
		if (this.window && !this.window.isDestroyed()) this.window.destroy()
		this.window = null
		for (const pending of this.requests.values()) { clearTimeout(pending.timer); pending.reject(new AppError("AUDIO_HOST_CLOSED", "Audio engine is closed")) }
		this.requests.clear()
		ipcMain.off("audio-host:response", this.responseHandler)
	}
}

module.exports = {AudioHost}
