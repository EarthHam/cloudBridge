import {EventEmitter} from "node:events"
import {describe, expect, it, vi} from "vitest"
import peers from "../../src/main/network/Peer.cjs"
import serial from "../../src/main/serial/SerialSession.cjs"
import constants from "../../src/shared/constants.cjs"
const {Peer} = peers
const {MAX_PENDING_BYTES, MAX_PENDING_ITEMS} = constants
const transport = () => Object.assign(new EventEmitter(), {destroyed: false, writableLength: 0, destroy: vi.fn(), write: vi.fn(() => false)})
describe("bounded forwarding queues", () => {
	it("pauses a TCP source once and resumes on drain", () => {
		const socket = transport(), source = {pause: vi.fn(), resume: vi.fn()}, peer = new Peer(socket, "tcp")
		peer.send(Buffer.alloc(20), source); peer.send(Buffer.alloc(20), source)
		expect(source.pause).toHaveBeenCalledTimes(1)
		socket.emit("drain"); expect(source.resume).toHaveBeenCalledTimes(1)
		peer.close()
	})
	it("rejects excessive TCP and WebSocket buffering", () => {
		const socket = transport(), peer = new Peer(socket, "tcp")
		socket.writableLength = MAX_PENDING_BYTES
		expect(peer.send(Buffer.alloc(1))).toBe(false); expect(socket.write).not.toHaveBeenCalled(); expect(peer.closed).toBe(true)
		const ws = Object.assign(new EventEmitter(), {readyState: 1, bufferedAmount: MAX_PENDING_BYTES, send: vi.fn(), close: vi.fn(), terminate: vi.fn()})
		const client = new Peer(ws, "websocket"); client.send(Buffer.alloc(1)); expect(ws.send).not.toHaveBeenCalled(); expect(client.closed).toBe(true); ws.emit("close")
	})
	it("bounds queued serial operations and discards them on close", async () => {
		let finish
		const peer = {fail: vi.fn()}, session = new serial.SerialSession({target: {}, peer, log: {}, instanceId: "test"})
		let completed = 0
		session.enqueue(() => new Promise(resolve => { finish = resolve }), 1)
		for (let index = 1; index < MAX_PENDING_ITEMS; index++) session.enqueue(async () => { completed++ }, 1)
		session.enqueue(async () => {}, 1)
		expect(peer.fail).toHaveBeenCalledWith(expect.objectContaining({code: "QUEUE_OVERFLOW"}))
		const closing = session.close(); finish(); await closing; await session.processing
		expect(completed).toBe(0); expect(session.pendingBytes).toBe(0); expect(session.pendingItems).toBe(0)
	})
	it("charges bytes before accepting serial work", async () => {
		let finish
		const peer = {fail: vi.fn()}, session = new serial.SerialSession({target: {}, peer, log: {}, instanceId: "test"})
		session.enqueue(() => new Promise(resolve => { finish = resolve }), MAX_PENDING_BYTES)
		session.enqueue(async () => {}, 1)
		expect(session.pendingBytes).toBe(MAX_PENDING_BYTES); expect(peer.fail).toHaveBeenCalledTimes(1)
		finish(); await session.processing; await session.close()
	})
})

describe("TCP target backpressure", () => {
	it("resumes after drain and closes the sending peer at its byte limit", async () => {
		const {PersistentTcpTarget} = await import("../../src/main/network/PersistentTcpTarget.cjs")
		const target = new PersistentTcpTarget({host: "localhost", port: 9, log: {}, instanceId: "test"})
		const socket = target.socket = transport()
		const source = {pause: vi.fn(), resume: vi.fn(), fail: vi.fn()}
		target.write(Buffer.alloc(1), source); target.write(Buffer.alloc(1), source)
		expect(source.pause).toHaveBeenCalledTimes(1)
		socket.emit("drain"); expect(source.resume).toHaveBeenCalledTimes(1)
		socket.writableLength = MAX_PENDING_BYTES
		target.write(Buffer.alloc(1), source)
		expect(source.fail).toHaveBeenCalledWith(expect.objectContaining({code: "QUEUE_OVERFLOW"}))
		target.stop()
	})
})
