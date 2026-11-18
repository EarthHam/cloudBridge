const {randomUUID} = require("node:crypto")
const {URL} = require("node:url")
const {CLOUDSAT_PATHS, PROTOCOL_VERSION} = require("../../shared/constants.cjs")
const {AppError} = require("../errors/AppError.cjs")
const {ConnectionScope} = require("../network/ConnectionScope.cjs")
const {Peer} = require("../network/Peer.cjs")
const {createBaseServer, createWebSocketServer, listen, closeServer} = require("../network/serverHelpers.cjs")
const {baseMessage, decodeAudioFrame, encodeAudioFrame} = require("../network/protocol.cjs")
const {isLanAddress} = require("../security/lanAccess.cjs")
const {AuthRateLimiter} = require("../security/AuthRateLimiter.cjs")
const {authenticateWebSocket} = require("../security/webSocketAuth.cjs")
const {SerialSession} = require("../serial/SerialSession.cjs")

const routeNames = Object.freeze({
	[CLOUDSAT_PATHS.RADIO]: "radio",
	[CLOUDSAT_PATHS.PTZ]: "ptz",
	[CLOUDSAT_PATHS.SDR]: "sdr"
})

class CloudSatRuntime {
	constructor({instance, secret, tls, audioHost, log}) {
		this.instance = instance
		this.secret = secret
		this.tls = tls
		this.audioHost = audioHost
		this.log = log
		this.server = null
		this.webSocketServer = createWebSocketServer()
		this.clients = new Map()
		this.sessions = new Set()
		this.limiter = new AuthRateLimiter()
		this.audioMetrics = null
		this.effectiveBindHost = instance.bindHost
		this.scope = new ConnectionScope({allow: isLanAddress})
		this.signals = new WeakMap()
	}

	async start() {
		this.server = createBaseServer({tls: this.tls, requestHandler: (request, response) => this.handleHttp(request, response)})
		this.scope.attach(this.server)
		this.server.on("upgrade", (request, socket, head) => {
			if (this.scope.stopping || !isLanAddress(socket.remoteAddress)) {
				socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n"); return
			}
			let pathname
			try { pathname = new URL(request.url, "http://localhost").pathname } catch { socket.destroy(); return }
			if (![CLOUDSAT_PATHS.MEDIA, ...Object.keys(routeNames)].includes(pathname)) { socket.destroy(); return }
			this.webSocketServer.handleUpgrade(request, socket, head, webSocket => { if (this.scope.accept(webSocket)) this.scope.track(this.handleWebSocket(pathname, webSocket, request)) })
		})
		this.effectiveBindHost = (await listen(this.server, this.instance.bindHost, this.instance.listenPort)).host
		this.log.info(this.instance.id, "Cloud Sat instance started", {host: this.effectiveBindHost, port: this.instance.listenPort})
	}

	handleHttp(request, response) {
		if (this.scope.stopping || !isLanAddress(request.socket.remoteAddress)) { response.writeHead(403); response.end(); return }
		if (request.url !== "/health") { response.writeHead(404); response.end(); return }
		response.writeHead(200, {"content-type": "application/json; charset=utf-8"})
		response.end(JSON.stringify(this.health()))
	}

	async handleWebSocket(pathname, webSocket, request) {
		webSocket.on("error", error => this.log.warn(this.instance.id, "WebSocket error", {message: error.message, path: pathname}))
		try {
			if (pathname === CLOUDSAT_PATHS.MEDIA) await this.handleAudio(webSocket, request)
			else await this.handleSerial(routeNames[pathname], webSocket, request)
		} catch (error) {
			this.sendError(webSocket, error)
			webSocket.close(error.code === "DEVICE_BUSY" ? 1013 : 1008, "Connection rejected")
		}
	}

	connectionSignal(webSocket) {
		if (!this.signals.has(webSocket)) {
			const controller = new AbortController()
			webSocket.once("close", () => controller.abort())
			this.signals.set(webSocket, AbortSignal.any([this.scope.signal, controller.signal]))
		}
		return this.signals.get(webSocket)
	}
	assertActive(webSocket) {
		if (this.connectionSignal(webSocket).aborted || webSocket.readyState !== 1) throw new AppError("SESSION_CANCELLED", "Connection was cancelled")
	}

	async authenticate(webSocket, request) {
		if (!this.instance.authenticationRequired) return
		await authenticateWebSocket({
			webSocket,
			instance: this.instance,
			secret: this.secret,
			limiter: this.limiter,
			source: request.socket.remoteAddress || "unknown",
			signal: this.connectionSignal(webSocket),
			stopSignal: this.scope.signal
		})
	}

	async handleAudio(webSocket, request) {
		if (!this.instance.audio.enabled) throw new AppError("AUDIO_DISABLED", "Audio is disabled")
		if (this.clients.has("audio")) throw new AppError("DEVICE_BUSY", "Audio is already connected")
		await this.authenticate(webSocket, request)
		this.assertActive(webSocket)
		if (this.clients.has("audio")) throw new AppError("DEVICE_BUSY", "Audio is already connected")
		const peer = new Peer(webSocket, "websocket")
		peer.on("error", error => this.log.warn(this.instance.id, "Audio connection error", {message: error.message}))
		const sessionId = randomUUID().replaceAll("-", "")
		let sequence = 0
		let audioSession
		let audioClosing
		const close = () => {
			if (this.clients.get("audio") === webSocket) this.clients.delete("audio")
			if (audioSession && !audioClosing) audioClosing = this.scope.track(Promise.resolve(audioSession.close()))
			return audioClosing
		}
		this.clients.set("audio", webSocket)
		webSocket.once("close", close)
		try {
			audioSession = await this.audioHost.openSession({
				instanceId: this.instance.id,
				signal: this.connectionSignal(webSocket),
				inputDeviceId: this.instance.audio.inputDeviceId,
				outputDeviceId: this.instance.audio.outputDeviceId,
				onCapture: pcm => { if (!this.scope.stopping && !this.connectionSignal(webSocket).aborted) peer.send(encodeAudioFrame(sequence++, pcm)) },
				onMetrics: metrics => { this.audioMetrics = metrics },
				onError: error => { this.sendError(webSocket, error, sessionId); webSocket.close(1011, "Audio device error") }
			})
			if (this.connectionSignal(webSocket).aborted || webSocket.readyState !== 1) { await close(); return }
			peer.send(JSON.stringify(baseMessage("authenticated", this.instance.deviceId, sessionId, {deviceStatus: "online", agentInfo: {sampleRate: 48000, channels: 1}})))
			webSocket.on("message", (data, isBinary) => {
				try {
					this.assertActive(webSocket)
					if (isBinary) { audioSession.play(decodeAudioFrame(data).pcm); return }
					const message = JSON.parse(Buffer.from(data).toString("utf8"))
					if (message.version !== PROTOCOL_VERSION || message.deviceId !== this.instance.deviceId || message.sessionId !== sessionId) throw new AppError("SESSION_EXPIRED", "Audio session is invalid")
					if (message.type === "ping") peer.send(JSON.stringify(baseMessage("pong", this.instance.deviceId, sessionId, {timestamp: message.timestamp})))
					else if (message.type === "disconnect") webSocket.close(1000, "Client disconnected")
					else throw new AppError("PROTOCOL_MISMATCH", "Unsupported control message")
				} catch (error) { this.sendError(webSocket, error, sessionId); webSocket.close(1008, "Protocol error") }
			})
		} catch (error) { await close(); throw error }
	}

	async handleSerial(name, webSocket, request) {
		const target = this.instance.serialBridges[name]
		if (!target || !target.enabled) throw new AppError("SERIAL_DISABLED", `${name} serial bridge is disabled`)
		if (this.clients.has(name)) throw new AppError("DEVICE_BUSY", `${name} serial bridge is already connected`)
		await this.authenticate(webSocket, request)
		this.assertActive(webSocket)
		if (this.clients.has(name)) throw new AppError("DEVICE_BUSY", `${name} serial bridge is already connected`)
		const peer = new Peer(webSocket, "websocket")
		const session = new SerialSession({target, peer, log: this.log, instanceId: this.instance.id, signal: this.connectionSignal(webSocket)})
		this.clients.set(name, webSocket)
		this.sessions.add(session)
		peer.on("error", error => this.log.warn(this.instance.id, `${name} bridge error`, {message: error.message}))
		peer.onClose(() => {
			if (this.clients.get(name) === webSocket) this.clients.delete(name)
			this.scope.track(session.close().finally(() => this.sessions.delete(session)))
		})
		try {
			await session.start()
			this.assertActive(webSocket)
			if (this.instance.authenticationRequired) peer.send(JSON.stringify(baseMessage("authenticated", this.instance.deviceId, randomUUID().replaceAll("-", ""), {bridge: name})))
		} catch (error) {
			if (this.clients.get(name) === webSocket) this.clients.delete(name)
			await session.close(); this.sessions.delete(session); peer.close(1011, "Serial device error"); throw error
		}
	}

	sendError(webSocket, error, sessionId = "") {
		if (webSocket.readyState !== 1) return
		webSocket.send(JSON.stringify(baseMessage("error", this.instance.deviceId, sessionId, {code: error.code || "INTERNAL_ERROR", message: error.message || "Internal error"})))
	}

	health() {
		return {
			status: "ok",
			deviceId: this.instance.deviceId,
			secure: Boolean(this.tls),
			audioEnabled: this.instance.audio.enabled,
			activeSessions: this.clients.size,
			audioDiagnostics: this.audioMetrics,
			serialBridges: Object.fromEntries(["radio", "ptz", "sdr"].map(name => [name, {enabled: Boolean(this.instance.serialBridges[name]?.enabled), connected: this.clients.has(name)}]))
		}
	}

	stop() {
		if (this.stopPromise) return this.stopPromise
		const connections = this.scope.stop()
		this.stopPromise = (async () => {
			for (const session of [...this.sessions]) await session.close()
			await connections
			this.sessions.clear()
			this.clients.clear()
			this.webSocketServer.close()
			await closeServer(this.server)
			this.log.info(this.instance.id, "Cloud Sat instance stopped")
		})()
		return this.stopPromise
	}
}

module.exports = {CloudSatRuntime}
