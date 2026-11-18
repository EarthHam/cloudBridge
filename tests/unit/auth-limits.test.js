import {EventEmitter} from "node:events"
import {describe, expect, it, vi} from "vitest"
import limits from "../../src/main/security/AuthRateLimiter.cjs"
import auth from "../../src/main/security/webSocketAuth.cjs"
const {AuthRateLimiter} = limits
const attempt = (limiter, source, signal) => {
	const socket = new EventEmitter()
	return {socket, result: auth.authenticateWebSocket({webSocket: socket, instance: {deviceId: "station"}, secret: "correct", limiter, source, signal})}
}
const packet = secret => Buffer.from(JSON.stringify({version: 2, type: "authenticate", role: "controller", deviceId: "station", secret}))
describe("atomic authentication limits", () => {
	it("reserves the attempt before receiving any frame", async () => {
		const limiter = new AuthRateLimiter({attempts: 1})
		const first = attempt(limiter, "127.0.0.1")
		await expect(attempt(limiter, "::ffff:127.0.0.1").result).rejects.toMatchObject({code: "RATE_LIMITED"})
		first.socket.emit("message", packet("bad"), false)
		await expect(first.result).rejects.toMatchObject({code: "AUTH_FAILED"})
		expect(limiter.pending).toBe(0)
	})
	it("enforces per-source, global and bounded history limits", () => {
		const limiter = new AuthRateLimiter({perSource: 1, maxPending: 2, maxSources: 2})
		const a = limiter.reserve("a"), b = limiter.reserve("b")
		expect(() => limiter.reserve("a")).toThrowError(expect.objectContaining({code: "RATE_LIMITED"}))
		expect(() => limiter.reserve("c")).toThrow()
		a({failed: true}); b({failed: true})
		expect(() => limiter.reserve("c")).toThrow()
		expect(limiter.history.size).toBe(2)
	})
	it("success does not erase another failure and release is idempotent", async () => {
		const limiter = new AuthRateLimiter({attempts: 2})
		const bad = attempt(limiter, "same"), good = attempt(limiter, "same")
		bad.socket.emit("message", packet("bad"), false)
		await expect(bad.result).rejects.toThrow()
		good.socket.emit("message", packet("correct"), false)
		await good.result
		const release = limiter.reserve("same")
		expect(() => limiter.reserve("same")).toThrow()
		release(); release()
		expect(limiter.pending).toBe(0)
	})
	it("counts invalid JSON, null, disconnect and timeout; cancellation is free", async () => {
		vi.useFakeTimers()
		try {
			const limiter = new AuthRateLimiter()
			for (const data of ["bad-json", "null"]) {
				const test = attempt(limiter, "same"); test.socket.emit("message", Buffer.from(data), false)
				await expect(test.result).rejects.toMatchObject({code: "AUTH_FAILED"})
			}
			const disconnected = attempt(limiter, "same"); disconnected.socket.emit("close"); await expect(disconnected.result).rejects.toThrow()
			const timeout = attempt(limiter, "same"); const rejection = expect(timeout.result).rejects.toThrow(); await vi.advanceTimersByTimeAsync(10000); await rejection
			const controller = new AbortController(), cancelled = attempt(limiter, "same", controller.signal)
			controller.abort(); await expect(cancelled.result).rejects.toMatchObject({code: "SESSION_CANCELLED"})
			expect(limiter.history.get("same").failures).toHaveLength(4)
			expect(cancelled.socket.eventNames()).toEqual([])
			expect(limiter.pending).toBe(0)
			await vi.advanceTimersByTimeAsync(60000)
			const release = limiter.reserve("new"); expect(limiter.history.size).toBe(1); release()
		} finally { vi.useRealTimers() }
	})
})
