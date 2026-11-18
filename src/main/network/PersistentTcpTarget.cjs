const net = require("node:net")
const {MAX_PENDING_BYTES} = require("../../shared/constants.cjs")
const {AppError} = require("../errors/AppError.cjs")
const {EventEmitter} = require("node:events")

class PersistentTcpTarget extends EventEmitter {
	constructor({host, port, log, instanceId}) {
		super()
		this.host = host
		this.port = port
		this.log = log
		this.instanceId = instanceId
		this.socket = null
		this.stopped = true
		this.retryMs = 1000
		this.retryTimer = null
		this.pausedSource = null
	}
	start() { this.stopped = false; this.connect() }
	connect() {
		if (this.stopped || this.socket) return
		const socket = net.createConnection({host: this.host, port: this.port})
		this.socket = socket
		socket.on("connect", () => { this.retryMs = 1000; this.log.info(this.instanceId, "Remote TCP connected", {host: this.host, port: this.port}); this.emit("status", "connected") })
		socket.on("data", data => this.emit("data", Buffer.from(data)))
		socket.on("error", error => { this.log.warn(this.instanceId, "Remote TCP error", {message: error.message}); this.emit("status", "error") })
		socket.on("close", () => {
			if (this.socket === socket) this.socket = null
			if (this.pausedSource) this.pausedSource.resume()
			this.pausedSource = null
			this.emit("status", "disconnected")
			if (!this.stopped) {
				this.retryTimer = setTimeout(() => this.connect(), this.retryMs)
				this.retryMs = Math.min(this.retryMs * 2, 30_000)
			}
		})
	}
	pause() { this.socket?.pause() }
	resume() { this.socket?.resume() }
	write(data, source) {
		const socket = this.socket
		if (!socket || socket.destroyed || socket.connecting) return
		if (socket.writableLength + data.length > MAX_PENDING_BYTES) {
			source?.fail(new AppError("QUEUE_OVERFLOW", "TCP target send queue is full"))
			return
		}
		if (!socket.write(data) && source && !this.pausedSource) {
			this.pausedSource = source
			source.pause()
			socket.once("drain", () => { if (this.pausedSource === source) { this.pausedSource = null; source.resume() } })
		}
	}
	stop() { this.stopped = true; clearTimeout(this.retryTimer); if (this.socket) this.socket.destroy(); this.socket = null }
}

module.exports = {PersistentTcpTarget}
