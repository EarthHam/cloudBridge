const {EventEmitter} = require("node:events")
const {MAX_PENDING_BYTES, MAX_PENDING_ITEMS} = require("../../shared/constants.cjs")
const {AppError} = require("../errors/AppError.cjs")

class Peer extends EventEmitter {
	constructor(transport, kind) {
		super()
		this.transport = transport
		this.kind = kind
		this.closed = false
		this.pendingBytes = 0
		this.pendingItems = 0
		this.pausedSources = new Set()
		if (kind === "websocket") transport.on("message", data => { if (!this.closed) this.emit("data", Buffer.from(data)) })
		else transport.on("data", data => { if (!this.closed) this.emit("data", Buffer.from(data)) })
		transport.on("close", () => this.markClosed())
		transport.on("error", error => this.fail(error))
	}
	onData(listener) { this.on("data", listener); return () => this.off("data", listener) }
	onClose(listener) { this.on("close", listener); return () => this.off("close", listener) }
	pause() { this.transport.pause?.() }
	resume() { if (!this.closed) this.transport.resume?.() }
	send(data, source) {
		if (this.closed) return false
		const length = Buffer.byteLength(data)
		const buffered = this.kind === "websocket" ? Math.max(this.transport.bufferedAmount || 0, this.pendingBytes) : this.transport.writableLength || 0
		if (buffered + length > MAX_PENDING_BYTES || this.pendingItems >= MAX_PENDING_ITEMS) {
			this.fail(new AppError("QUEUE_OVERFLOW", "Client send queue is full")); return false
		}
		if (this.kind === "websocket" && this.transport.readyState !== 1 || this.transport.destroyed) return false
		this.pendingBytes += length
		this.pendingItems++
		const done = error => {
			this.pendingBytes -= length
			this.pendingItems--
			if (error) this.fail(error)
		}
		try {
			if (this.kind === "websocket") this.transport.send(data, done)
			else if (!this.transport.write(data, done) && source && !this.pausedSources.has(source)) {
				this.pausedSources.add(source)
				source.pause()
				this.transport.once("drain", () => { if (this.pausedSources.delete(source)) source.resume() })
			}
		} catch (error) { done(error); return false }
		return true
	}
	fail(error) { if (this.closed) return; if (this.listenerCount("error")) this.emit("error", error); this.close() }
	markClosed() {
		if (this.closed) return
		this.closed = true
		for (const source of this.pausedSources) source.resume()
		this.pausedSources.clear()
		this.emit("close")
	}
	close(code = 1000, reason = "") {
		if (this.closed) return
		if (this.kind === "websocket") {
			this.transport.close(code, reason)
			const timer = setTimeout(() => this.transport.terminate(), 1000)
			timer.unref?.()
			this.transport.once("close", () => clearTimeout(timer))
		} else this.transport.destroy()
		this.markClosed()
	}
}
module.exports = {Peer}
