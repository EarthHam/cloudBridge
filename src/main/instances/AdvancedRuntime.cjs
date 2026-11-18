const net = require("node:net")
const {Peer} = require("../network/Peer.cjs")
const {PersistentTcpTarget} = require("../network/PersistentTcpTarget.cjs")
const {ConnectionScope} = require("../network/ConnectionScope.cjs")
const {createBaseServer, createWebSocketServer, listen, closeServer} = require("../network/serverHelpers.cjs")
const {isLanAddress, isAllowedOrigin} = require("../security/lanAccess.cjs")
const {MAX_CONNECTIONS} = require("../../shared/constants.cjs")
const {SerialSession} = require("../serial/SerialSession.cjs")

class AdvancedRuntime {
	constructor({instance, tls, log}) {
		Object.assign(this, {instance, tls, log})
		this.server = null
		this.webSocketServer = null
		this.activePeer = null
		this.serialSession = null
		this.tcpTarget = null
		this.stats = {receivedBytes: 0, sentBytes: 0, connected: false, remoteStatus: "idle"}
		this.effectiveBindHost = instance.bindHost
		this.scope = new ConnectionScope({allow: isLanAddress})
	}
	async start() {
		if (this.instance.kind.endsWith("-tcp")) {
			this.tcpTarget = new PersistentTcpTarget({host: this.instance.remoteHost, port: this.instance.remotePort, log: this.log, instanceId: this.instance.id})
			this.tcpTarget.on("data", data => {
				if (this.scope.stopping) return
				this.stats.sentBytes += data.length
				this.activePeer?.send(data, this.tcpTarget)
			})
			this.tcpTarget.on("status", status => { this.stats.remoteStatus = status })
			this.tcpTarget.start()
		}
		try {
			if (this.instance.kind.startsWith("websocket-")) await this.startWebSocketServer()
			else await this.startTcpServer()
		} catch (error) { this.tcpTarget?.stop(); throw error }
		this.log.info(this.instance.id, "Forwarding task started", {kind: this.instance.kind, host: this.effectiveBindHost, port: this.instance.listenPort})
	}
	async startWebSocketServer() {
		this.webSocketServer = createWebSocketServer()
		this.server = createBaseServer({tls: this.tls, requestHandler: (request, response) => {
			response.writeHead(!this.scope.stopping && isLanAddress(request.socket.remoteAddress) ? 404 : 403); response.end()
		}})
		this.scope.attach(this.server)
		this.server.on("upgrade", (request, socket, head) => {
			if (this.scope.stopping || !isLanAddress(socket.remoteAddress) || !isAllowedOrigin(request.headers.origin, this.instance.allowedOrigins)) {
				socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n"); return
			}
			if (request.url !== "/" && request.url !== "") { socket.destroy(); return }
			this.webSocketServer.handleUpgrade(request, socket, head, webSocket => {
				if (this.scope.accept(webSocket)) this.runPeer(new Peer(webSocket, "websocket"))
			})
		})
		this.effectiveBindHost = (await listen(this.server, this.instance.bindHost, this.instance.listenPort)).host
	}
	async startTcpServer() {
		this.server = net.createServer(socket => {
			if (this.scope.stopping || this.scope.sockets.size >= MAX_CONNECTIONS || !isLanAddress(socket.remoteAddress)) { socket.destroy(); return }
			this.runPeer(new Peer(socket, "tcp"))
		})
		this.scope.attach(this.server)
		this.effectiveBindHost = (await listen(this.server, this.instance.bindHost, this.instance.listenPort)).host
	}
	runPeer(peer) {
		this.scope.track(this.acceptPeer(peer).catch(error => {
			this.log.error(this.instance.id, "Unable to accept forwarding client", {message: error.message})
			peer.close(1011, "Device error")
		}))
	}
	async acceptPeer(peer) {
		peer.on("error", error => this.log.warn(this.instance.id, "Forwarding client error", {message: error.message}))
		if (this.scope.stopping || this.activePeer) { peer.close(1013, "Task is already connected"); return }
		this.activePeer = peer
		this.stats.connected = true
		peer.onClose(() => this.scope.track(this.releasePeer(peer)))
		if (this.instance.kind.endsWith("-serial")) {
			const session = new SerialSession({target: this.instance.serial, peer, log: this.log, instanceId: this.instance.id, signal: this.scope.signal})
			this.serialSession = session
			try { await session.start() } catch (error) { await session.close(); throw error }
			return
		}
		this.removePeerData = peer.onData(data => {
			if (this.scope.stopping || peer.closed) return
			this.stats.receivedBytes += data.length
			this.tcpTarget.write(data, peer)
		})
	}
	async releasePeer(peer) {
		if (this.activePeer !== peer) return
		this.removePeerData?.()
		this.removePeerData = null
		const session = this.serialSession
		if (session) await session.close()
		if (this.activePeer !== peer) return
		this.serialSession = null
		this.activePeer = null
		this.stats.connected = false
	}
	health() { return {...this.stats} }
	stop() {
		if (this.stopPromise) return this.stopPromise
		const connections = this.scope.stop()
		this.activePeer?.close(1001, "Task stopped")
		this.tcpTarget?.stop()
		this.stopPromise = (async () => {
			if (this.serialSession) await this.serialSession.close()
			await connections
			this.serialSession = null
			this.tcpTarget = null
			this.activePeer = null
			this.webSocketServer?.close()
			await closeServer(this.server)
			this.log.info(this.instance.id, "Forwarding task stopped")
		})()
		return this.stopPromise
	}
}
module.exports = {AdvancedRuntime}
