import net from "node:net"
import http from "node:http"
import os from "node:os"
import {afterEach, describe, expect, it, vi} from "vitest"
import WebSocket from "ws"
import cloudModule from "../../src/main/instances/CloudSatRuntime.cjs"
import advancedModule from "../../src/main/instances/AdvancedRuntime.cjs"
import {advancedInstance, cloudSatInstance} from "./helpers.js"
const log = {info: vi.fn(), warn: vi.fn(), error: vi.fn()}
const cleanup = []
afterEach(async () => { while (cleanup.length) await cleanup.pop()() })
const connect = async (url, options) => {
	const ws = new WebSocket(url, options), messages = []
	ws.on("message", data => { try { messages.push(JSON.parse(data.toString())) } catch { messages.push(data) } })
	await new Promise((resolve, reject) => { ws.once("open", resolve); ws.once("error", reject) })
	cleanup.push(() => ws.terminate())
	return {ws, messages}
}
const auth = ws => ws.send(JSON.stringify({version: 2, type: "authenticate", role: "controller", deviceId: "station-main", secret: "secret"}))
const cloud = async audioHost => {
	const runtime = new cloudModule.CloudSatRuntime({instance: cloudSatInstance({listenPort: 0, audio: {enabled: true}}), secret: "secret", tls: null, audioHost, log})
	await runtime.start(); cleanup.push(() => runtime.stop())
	return {runtime, url: `ws://127.0.0.1:${runtime.server.address().port}/media`}
}
describe("runtime security regressions", () => {
	it.each(["/media", "/serial/radio", "/serial/ptz", "/serial/sdr"])("rejects non-LAN sources before upgrading Cloud Sat %s even without authentication", async pathname => {
		const host = {openSession: vi.fn()}, {runtime} = await cloud(host)
		runtime.instance.authenticationRequired = false
		const upgrade = vi.spyOn(runtime.webSocketServer, "handleUpgrade")
		const socket = {remoteAddress: "203.0.113.1", end: vi.fn()}
		runtime.server.emit("upgrade", {url: pathname, headers: {"x-forwarded-for": "127.0.0.1"}}, socket, Buffer.alloc(0))
		expect(socket.end).toHaveBeenCalledWith(expect.stringContaining("403"))
		expect(upgrade).not.toHaveBeenCalled(); expect(host.openSession).not.toHaveBeenCalled()
		expect(runtime.scope.allow("203.0.113.1")).toBe(false)
	})
	it("protects Cloud Sat health while allowing a real loopback request", async () => {
		const {runtime} = await cloud({openSession: vi.fn()})
		const response = {writeHead: vi.fn(), end: vi.fn()}
		runtime.handleHttp({url: "/health", socket: {remoteAddress: "203.0.113.1"}, headers: {"x-forwarded-for": "127.0.0.1"}}, response)
		expect(response.writeHead).toHaveBeenCalledWith(403)
		expect(response.end).toHaveBeenCalledWith()
		const status = await new Promise((resolve, reject) => {
			http.get(`http://127.0.0.1:${runtime.server.address().port}/health`, result => { result.resume(); resolve(result.statusCode) }).on("error", reject)
		})
		expect(status).toBe(200)
	})
	it("counts client disconnects as failures while instance cancellation is free", async () => {
		const {runtime, url} = await cloud({openSession: vi.fn()})
		const first = await connect(url)
		first.ws.close()
		await vi.waitFor(() => expect([...runtime.limiter.history.values()].reduce((total, entry) => total + entry.failures.length, 0)).toBe(1))
		await connect(url)
		await runtime.stop()
		expect([...runtime.limiter.history.values()].reduce((total, entry) => total + entry.failures.length, 0)).toBe(1)
	})
	it("admits only one simultaneous audio authentication and preserves its owner", async () => {
		const session = {play: vi.fn(), close: vi.fn()}, host = {openSession: vi.fn(async () => session)}
		const {runtime, url} = await cloud(host)
		const a = await connect(url), b = await connect(url)
		auth(a.ws); auth(b.ws)
		await vi.waitFor(() => expect(a.messages.some(message => message.type === "authenticated")).toBe(true))
		await vi.waitFor(() => expect(b.messages.some(message => message.code === "DEVICE_BUSY")).toBe(true))
		expect(host.openSession).toHaveBeenCalledTimes(1); expect(runtime.clients.size).toBe(1)
		await runtime.stop(); expect(session.close).toHaveBeenCalledTimes(1); expect(runtime.clients.size).toBe(0)
	})
	it("cancels authentication when stop begins and releases all counters", async () => {
		const host = {openSession: vi.fn()}
		const {runtime, url} = await cloud(host), client = await connect(url)
		const stopping = runtime.stop()
		if (client.ws.readyState === 1) auth(client.ws)
		await stopping
		expect(host.openSession).not.toHaveBeenCalled(); expect(runtime.limiter.pending).toBe(0)
		expect(runtime.scope.sockets.size).toBe(0); expect(runtime.scope.tasks.size).toBe(0)
	})
	it("cleans a late audio initialization before stop resolves", async () => {
		let resolveOpen
		const session = {play: vi.fn(), close: vi.fn()}
		const host = {openSession: vi.fn(() => new Promise(resolve => { resolveOpen = resolve }))}
		const {runtime, url} = await cloud(host), client = await connect(url)
		auth(client.ws); await vi.waitFor(() => expect(host.openSession).toHaveBeenCalledTimes(1))
		let stopped = false
		const stopping = runtime.stop().then(() => { stopped = true })
		expect(stopped).toBe(false)
		resolveOpen(session); await stopping
		expect(session.close).toHaveBeenCalledTimes(1)
		expect(client.messages.some(message => message.type === "authenticated")).toBe(false)
		expect(runtime.clients.size).toBe(0)
		await runtime.stop(); expect(session.close).toHaveBeenCalledTimes(1)
	})
	it("allows retry after initialization failure without deleting a replacement", async () => {
		const session = {play: vi.fn(), close: vi.fn()}, host = {openSession: vi.fn().mockRejectedValueOnce(new Error("No device")).mockResolvedValue(session)}
		const {runtime, url} = await cloud(host), first = await connect(url)
		auth(first.ws); await vi.waitFor(() => expect(first.messages.some(message => message.type === "error")).toBe(true))
		const second = await connect(url); auth(second.ws)
		await vi.waitFor(() => expect(second.messages.some(message => message.type === "authenticated")).toBe(true))
		expect(runtime.clients.size).toBe(1)
		await runtime.stop(); expect(session.close).toHaveBeenCalledTimes(1)
	})
	it("rejects a 65th raw connection and forcibly ends stalled handshakes on stop", async () => {
		const {runtime} = await cloud({openSession: vi.fn()})
		const port = runtime.server.address().port
		for (let index = 0; index < 64; index++) {
			const socket = net.createConnection({host: "127.0.0.1", port})
			cleanup.push(() => socket.destroy())
			await new Promise((resolve, reject) => { socket.once("connect", resolve); socket.once("error", reject) })
		}
		await vi.waitFor(() => expect(runtime.scope.sockets.size).toBe(64))
		const extra = net.createConnection({host: "127.0.0.1", port}); cleanup.push(() => extra.destroy())
		await new Promise(resolve => extra.once("close", resolve))
		expect(runtime.scope.sockets.size).toBe(64)
		await runtime.stop(); await vi.waitFor(() => expect(runtime.scope.sockets.size).toBe(0))
	})
	it("rejects untrusted origins before upgrade and permits configured native forwarding", async () => {
		const server = net.createServer(socket => socket.pipe(socket)); server.listen(0, "127.0.0.1")
		await new Promise(resolve => server.once("listening", resolve)); cleanup.push(() => new Promise(resolve => server.close(resolve)))
		const runtime = new advancedModule.AdvancedRuntime({instance: advancedInstance({kind: "websocket-tcp", listenPort: 0, remotePort: server.address().port, allowedOrigins: ["https://client.invalid"]}), tls: null, log})
		await runtime.start(); cleanup.push(() => runtime.stop())
		await vi.waitFor(() => expect(runtime.stats.remoteStatus).toBe("connected"))
		const url = `ws://127.0.0.1:${runtime.server.address().port}/`
		for (const origin of ["https://client.invalid.evil", "null", "https://client.invalid:444"]) {
			await expect(connect(url, {origin})).rejects.toThrow("403")
			expect(runtime.activePeer).toBe(null)
		}
		const native = await connect(url), echo = new Promise(resolve => native.ws.once("message", resolve))
		native.ws.send(Buffer.from([0, 1, 255])); expect(Buffer.from(await echo)).toEqual(Buffer.from([0, 1, 255]))
		native.ws.close(); await vi.waitFor(() => expect(runtime.activePeer).toBe(null))
		const allowed = await connect(url, {origin: "https://client.invalid"})
		expect(allowed.ws.readyState).toBe(1)
	})
	it("does not let forwarding proxy headers override the socket source", async () => {
		const runtime = new advancedModule.AdvancedRuntime({instance: advancedInstance({kind: "websocket-tcp", listenPort: 0, remotePort: 9}), tls: null, log})
		await runtime.start(); cleanup.push(() => runtime.stop())
		const spy = vi.spyOn(os, "networkInterfaces").mockReturnValue({})
		try {
			const request = {url: "/", headers: {origin: "https://ptz.cloudsat.cn", "x-forwarded-for": "127.0.0.1"}}
			const socket = {remoteAddress: "203.0.113.1", end: vi.fn(), destroy: vi.fn()}
			runtime.server.emit("upgrade", request, socket, Buffer.alloc(0))
			expect(socket.end).toHaveBeenCalledWith(expect.stringContaining("403")); expect(runtime.activePeer).toBe(null)
		} finally { spy.mockRestore() }
	})
})
