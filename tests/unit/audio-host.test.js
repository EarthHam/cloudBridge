import fs from "node:fs"
import vm from "node:vm"
import {createRequire} from "node:module"
import {EventEmitter} from "node:events"
import {describe, expect, it, vi} from "vitest"
const file = new URL("../../src/main/audio/AudioHost.cjs", import.meta.url)
const actualRequire = createRequire(file)
const fixture = ({ready = true} = {}) => {
	const ports = []
	class Port extends EventEmitter {
		constructor() { super(); this.postMessage = vi.fn(message => { if (message.type === "close") queueMicrotask(() => this.emit("message", {data: {type: "closed"}})) }); this.start = vi.fn(); this.close = vi.fn() }
	}
	class Channel { constructor() { this.port1 = new Port(); this.port2 = {}; ports.push(this.port1) } }
	const electron = {MessageChannelMain: Channel, ipcMain: {on() {}, off() {}}}
	const module = {exports: {}}
	vm.runInNewContext(fs.readFileSync(file, "utf8"), {module, require: name => name === "electron" ? electron : actualRequire(name), Buffer, setTimeout, clearTimeout})
	const host = new module.exports.AudioHost({appRoot: "/test", log: {error() {}}})
	host.window = {webContents: {postMessage: vi.fn(() => { if (ready) queueMicrotask(() => ports.at(-1).emit("message", {data: {type: "ready"}})) })}}
	host.ensureWindow = vi.fn(async () => {})
	const onError = vi.fn()
	return {host, ports, onError, options: {instanceId: "instance", inputDeviceId: "in", outputDeviceId: "out", onCapture: vi.fn(), onMetrics: vi.fn(), onError}}
}
describe("audio host ownership and IPC bounds", () => {
	it("cleans a disconnected MessagePort without posting into it", async () => {
		const {host, ports, options, onError} = fixture(), session = await host.openSession(options)
		ports[0].postMessage.mockImplementation(() => { throw new Error("Disconnected port") })
		ports[0].emit("close")
		await session.close()
		expect(host.sessions.size).toBe(0)
		expect(onError).toHaveBeenCalledWith(expect.objectContaining({code: "AUDIO_DEVICE_ERROR"}))
	})
	it("an old cleanup timeout cannot destroy a replacement audio window", async () => {
		vi.useFakeTimers()
		try {
			const {host, ports, options} = fixture(), session = await host.openSession(options)
			ports[0].postMessage.mockImplementation(() => {})
			const closing = session.close(), replacement = {destroy: vi.fn()}
			host.window = replacement
			await vi.advanceTimersByTimeAsync(12000); await closing
			expect(replacement.destroy).not.toHaveBeenCalled(); expect(host.sessions.size).toBe(0)
		} finally { vi.useRealTimers() }
	})
	it("reserves a session before awaiting the hidden window and cancels a late load", async () => {
		const {host, ports, options} = fixture()
		let loaded
		host.ensureWindow = () => new Promise(resolve => { loaded = resolve })
		const controller = new AbortController(), opening = host.openSession({...options, signal: controller.signal})
		const rejected = expect(opening).rejects.toMatchObject({code: "SESSION_CANCELLED"})
		await expect(host.openSession(options)).rejects.toMatchObject({code: "DEVICE_BUSY"})
		controller.abort(); await rejected; loaded()
		expect(ports).toHaveLength(0); expect(host.sessions.size).toBe(0)
	})
	it("waits for cleanup acknowledgement and closes once", async () => {
		const {host, ports, options} = fixture()
		const controller = new AbortController(), session = await host.openSession({...options, signal: controller.signal})
		controller.abort(); await session.close(); await session.close()
		expect(ports[0].postMessage.mock.calls.filter(([message]) => message.type === "close")).toHaveLength(1)
		expect(host.sessions.size).toBe(0)
	})
	it("bounds unacknowledged playback and releases credit only for known packets", async () => {
		const {host, ports, options, onError} = fixture(), session = await host.openSession(options), port = ports[0]
		const data = Buffer.alloc(65536)
		for (let index = 0; index < 16; index++) session.play(data)
		port.emit("message", {data: {type: "play-ack", id: 0}})
		port.emit("message", {data: {type: "play-ack", id: 0}})
		session.play(data); expect(onError).not.toHaveBeenCalled()
		session.play(Buffer.alloc(1)); expect(onError).toHaveBeenCalledWith(expect.objectContaining({code: "QUEUE_OVERFLOW"}))
		await session.close(); expect(host.sessions.size).toBe(0)
	})
})
