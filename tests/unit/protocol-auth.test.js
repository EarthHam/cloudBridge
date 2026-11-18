import {EventEmitter} from "node:events"
import {describe, expect, it} from "vitest"
import protocol from "../../src/main/network/protocol.cjs"
import auth from "../../src/main/security/webSocketAuth.cjs"
import limiterModule from "../../src/main/security/AuthRateLimiter.cjs"
import constants from "../../src/shared/constants.cjs"

const {encodeAudioFrame, decodeAudioFrame} = protocol
const {authenticateWebSocket, secureEqual} = auth
const {AuthRateLimiter} = limiterModule
const {AUDIO_FRAME_HEADER_BYTES, MAX_FRAME_BYTES} = constants

class FakeWebSocket extends EventEmitter {}

describe("protocol v2", () => {
	it("round-trips PCM16 frames and sequence numbers", () => {
		const pcm = Buffer.from([0, 1, 2, 3])
		const decoded = decodeAudioFrame(encodeAudioFrame(0xffffffff + 2, pcm))
		expect(decoded.sequence).toBe(1)
		expect(decoded.pcm).toEqual(pcm)
	})

	it("rejects malformed and oversized audio frames", () => {
		expect(() => decodeAudioFrame(Buffer.alloc(4))).toThrowError(expect.objectContaining({code: "PROTOCOL_MISMATCH"}))
		expect(() => encodeAudioFrame(0, Buffer.alloc(MAX_FRAME_BYTES - AUDIO_FRAME_HEADER_BYTES + 2))).toThrowError(expect.objectContaining({code: "FRAME_TOO_LARGE"}))
		expect(() => encodeAudioFrame(0, Buffer.alloc(3))).toThrowError(expect.objectContaining({code: "PROTOCOL_MISMATCH"}))
	})
})

describe("WebSocket authentication", () => {
	it("uses constant-time-compatible equality semantics", () => {
		expect(secureEqual("secret", "secret")).toBe(true)
		expect(secureEqual("secret", "other")).toBe(false)
		expect(secureEqual("short", "much-longer")).toBe(false)
	})

	it("accepts a valid first authentication message", async () => {
		const webSocket = new FakeWebSocket()
		const pending = authenticateWebSocket({webSocket, instance: {deviceId: "station"}, secret: "secret", limiter: new AuthRateLimiter(), source: "127.0.0.1"})
		queueMicrotask(() => webSocket.emit("message", Buffer.from(JSON.stringify({version: 2, type: "authenticate", role: "controller", deviceId: "station", secret: "secret"})), false))
		await expect(pending).resolves.toMatchObject({deviceId: "station"})
	})

	it("records failures and rate limits a source", async () => {
		const limiter = new AuthRateLimiter({attempts: 1})
		const first = new FakeWebSocket()
		const pending = authenticateWebSocket({webSocket: first, instance: {deviceId: "station"}, secret: "secret", limiter, source: "client"})
		queueMicrotask(() => first.emit("message", Buffer.from("{}"), false))
		await expect(pending).rejects.toMatchObject({code: "AUTH_FAILED"})
		await expect(authenticateWebSocket({webSocket: new FakeWebSocket(), instance: {deviceId: "station"}, secret: "secret", limiter, source: "client"})).rejects.toMatchObject({code: "RATE_LIMITED"})
	})
})
