const {SerialPort} = require("serialport")
const {InterByteTimeoutParser} = require("@serialport/parser-inter-byte-timeout")
const {MAX_FRAME_BYTES, MAX_PENDING_BYTES, MAX_PENDING_ITEMS} = require("../../shared/constants.cjs")
const {AppError} = require("../errors/AppError.cjs")
const {initializeControlLines, releaseControlLines, applyControlCommand} = require("./serialControl.cjs")

const cancelled = () => new AppError("SESSION_CANCELLED", "Serial session was cancelled")
const openPort = (target, signal) => new Promise((resolve, reject) => {
	if (signal?.aborted) { reject(cancelled()); return }
	const port = new SerialPort({path: target.path, baudRate: Number(target.baudRate), dataBits: 8, stopBits: 1, parity: "none", xon: false, xoff: false, rtscts: false, autoOpen: false})
	port.open(async error => {
		if (error) return reject(new AppError("SERIAL_DEVICE_ERROR", `Unable to open serial port: ${error.message}`))
		try {
			if (signal?.aborted) throw cancelled()
			await initializeControlLines(port, target.connectionMode)
			if (signal?.aborted) throw cancelled()
			resolve(port)
		} catch (controlError) {
			try { await releaseControlLines(port, target.connectionMode) } catch { /* The port is closed below even if control lines fail. */ }
			port.close(() => reject(controlError))
		}
	})
})

class SerialSession {
	constructor({target, peer, log, instanceId, signal}) {
		Object.assign(this, {target, peer, log, instanceId, signal})
		this.port = null
		this.parser = null
		this.closed = false
		this.queue = []
		this.pendingBytes = 0
		this.pendingItems = 0
		this.processing = null
		this.controller = new AbortController()
		this.onAbort = () => { this.close().catch(error => this.log.warn(this.instanceId, "Serial cleanup failed", {message: error.message})) }
		signal?.addEventListener("abort", this.onAbort, {once: true})
	}
	start() {
		if (!this.startPromise) this.startPromise = this.startNow()
		return this.startPromise
	}
	async startNow() {
		if (this.closed || this.signal?.aborted || this.peer.closed) throw cancelled()
		this.removeClose = this.peer.onClose(this.onAbort)
		this.port = await openPort(this.target, this.controller.signal)
		if (this.closed || this.signal?.aborted || this.peer.closed) throw cancelled()
		this.parser = this.port.pipe(new InterByteTimeoutParser({interval: 30, maxBufferSize: MAX_FRAME_BYTES}))
		this.parser.on("data", data => {
			if (this.closed) return
			this.log.info(this.instanceId, "Serial RX", {bytes: data.length})
			this.peer.send(data, this.port)
		})
		this.port.on("error", error => { if (!this.closed) this.peer.fail(new AppError("SERIAL_DEVICE_ERROR", error.message)) })
		this.port.on("close", () => { if (!this.closed) this.peer.fail(new AppError("SERIAL_DEVICE_ERROR", "Serial port disconnected")) })
		this.removeData = this.peer.onData(data => {
			if (data.length > MAX_FRAME_BYTES) { this.peer.fail(new AppError("FRAME_TOO_LARGE", "Serial write is limited to 64 KiB")); return }
			this.enqueue(async () => {
				if (this.closed) return
				if (await applyControlCommand(this.port, data, this.target.connectionMode) || this.closed) return
				await new Promise((resolve, reject) => this.port.write(data, error => error ? reject(error) : resolve()))
				this.log.info(this.instanceId, "Serial TX", {bytes: data.length})
			}, data.length)
		})
		return this
	}
	enqueue(operation, bytes = 0) {
		if (this.closed) return
		if (this.pendingBytes + bytes > MAX_PENDING_BYTES || this.pendingItems >= MAX_PENDING_ITEMS) {
			this.peer.fail(new AppError("QUEUE_OVERFLOW", "Serial write queue is full")); return
		}
		this.pendingBytes += bytes
		this.pendingItems++
		this.queue.push({operation, bytes})
		this.startProcessing()
	}
	startProcessing() {
		if (this.processing || this.closed) return
		this.processing = this.process().finally(() => { this.processing = null; if (this.queue.length) this.startProcessing() })
	}
	async process() {
		while (!this.closed && this.queue.length) {
			const item = this.queue.shift()
			try { await item.operation() } catch (error) { this.peer.fail(error) }
			finally { this.pendingBytes -= item.bytes; this.pendingItems-- }
		}
	}
	close() {
		if (this.closePromise) return this.closePromise
		this.closed = true
		this.controller.abort()
		this.signal?.removeEventListener("abort", this.onAbort)
		this.removeData?.()
		this.removeClose?.()
		for (const item of this.queue) { this.pendingBytes -= item.bytes; this.pendingItems-- }
		this.queue = []
		this.closePromise = (async () => {
			await this.startPromise?.catch(() => null)
			if (!this.port) return
			this.port.unpipe(this.parser)
			try { await releaseControlLines(this.port, this.target.connectionMode) } catch (error) { this.log.warn(this.instanceId, "Failed to release serial control lines", {message: error.message}) }
			await new Promise(resolve => this.port.close(() => resolve()))
			await this.processing
		})()
		return this.closePromise
	}
}
module.exports = {SerialSession, openPort}
