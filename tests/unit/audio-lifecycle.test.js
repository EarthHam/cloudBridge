import fs from "node:fs"
import vm from "node:vm"
import {describe, expect, it, vi} from "vitest"
const engineSource = fs.readFileSync(new URL("../../src/audio-renderer/engine.js", import.meta.url), "utf8")
describe("audio renderer cancellation", () => {
	it("registers before getUserMedia and stops a late stream without starting playback", async () => {
		let onOpen, resolveStream
		const stop = vi.fn(), AudioContext = vi.fn()
		const window = {addEventListener: (_name, handler) => { onOpen = (payload, port) => handler({source: window, data: {type: "cloudsat-audio-session", payload}, ports: [port]}) }, audioHost: {onRequest() {}}, location: {href: "file:///audio/index.html"}}
		vm.runInNewContext(engineSource, {window, navigator: {mediaDevices: {getUserMedia: () => new Promise(resolve => { resolveStream = resolve })}}, AudioContext, queueMicrotask, URL})
		const port = {start: vi.fn(), close: vi.fn(), postMessage: vi.fn()}
		onOpen({instanceId: "instance", sessionId: "one"}, port)
		port.onmessage({data: {type: "close"}})
		const replacement = {start: vi.fn(), close: vi.fn(), postMessage: vi.fn()}
		onOpen({instanceId: "instance", sessionId: "two"}, replacement)
		expect(replacement.postMessage).toHaveBeenCalledWith(expect.objectContaining({type: "error"}))
		resolveStream({getTracks: () => [{stop}]})
		await vi.waitFor(() => expect(port.postMessage).toHaveBeenCalledWith({type: "closed"}))
		expect(stop).toHaveBeenCalled(); expect(AudioContext).not.toHaveBeenCalled()
		expect(port.postMessage).not.toHaveBeenCalledWith({type: "ready"})
	})
	it("bounds unacknowledged capture messages inside the worklet", () => {
		let Processor
		class Base { constructor() { this.port = {postMessage: vi.fn()} } }
		vm.runInNewContext(fs.readFileSync(new URL("../../src/audio-renderer/capture.worklet.js", import.meta.url), "utf8"), {AudioWorkletProcessor: Base, registerProcessor: (_name, value) => { Processor = value }})
		const processor = new Processor({processorOptions: {bytes: 1024 * 1024, items: 256}}), input = new Float32Array(960)
		for (let index = 0; index < 300; index++) processor.process([[input]])
		expect(processor.pending.size).toBe(256)
		expect(processor.port.postMessage.mock.calls.filter(([message]) => message.type === "error")).toHaveLength(1)
		expect(processor.port.postMessage.mock.calls.filter(([message]) => message.type === "capture")).toHaveLength(256)
	})
})
