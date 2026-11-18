import net from "node:net"
import {afterEach, describe, expect, it, vi} from "vitest"
import WebSocket from "ws"
import cloudRuntimeModule from "../../src/main/instances/CloudSatRuntime.cjs"
import advancedRuntimeModule from "../../src/main/instances/AdvancedRuntime.cjs"
import serverHelpers from "../../src/main/network/serverHelpers.cjs"
import {advancedInstance, cloudSatInstance} from "./helpers.js"

const {CloudSatRuntime} = cloudRuntimeModule
const {AdvancedRuntime} = advancedRuntimeModule
const {listen: listenBridgeServer, closeServer} = serverHelpers
const cleanup = []
const log = {info: vi.fn(), warn: vi.fn(), error: vi.fn()}

afterEach(async () => {
	while (cleanup.length) await cleanup.pop()()
})

const openWebSocket = url => new Promise((resolve, reject) => {
	const webSocket = new WebSocket(url)
	webSocket.once("open", () => resolve(webSocket))
	webSocket.once("error", reject)
})

const nextMessage = webSocket => new Promise((resolve, reject) => {
	webSocket.once("message", data => resolve(JSON.parse(Buffer.from(data).toString("utf8"))))
	webSocket.once("error", reject)
})

const listen = server => new Promise((resolve, reject) => {
	server.once("error", reject)
	server.listen(0, "127.0.0.1", () => resolve(server.address().port))
})

describe("runtime integration", () => {
	it("accepts IPv4 and IPv6 connections through one dual-stack listener", async () => {
		const server = net.createServer(socket => socket.end())
		await listenBridgeServer(server, "::", 0)
		cleanup.push(() => closeServer(server))
		const {port} = server.address()
		const connect = host => new Promise((resolve, reject) => {
			const socket = net.createConnection({host, port})
			socket.once("connect", () => { socket.end(); resolve() })
			socket.once("error", reject)
		})
		await expect(Promise.all([connect("127.0.0.1"), connect("::1")])).resolves.toEqual([undefined, undefined])
	})

	it("authenticates an audio WebSocket, answers ping, and enforces one client", async () => {
		const audioSession = {play: vi.fn(), close: vi.fn()}
		const audioHost = {openSession: vi.fn(async () => audioSession)}
		const runtime = new CloudSatRuntime({
			instance: cloudSatInstance({listenPort: 0, audio: {enabled: true, inputDeviceId: "input", outputDeviceId: "output"}}),
			secret: "test-secret",
			tls: null,
			audioHost,
			log
		})
		await runtime.start()
		cleanup.push(() => runtime.stop())
		const port = runtime.server.address().port
		const webSocket = await openWebSocket(`ws://127.0.0.1:${port}/media`)
		webSocket.send(JSON.stringify({version: 2, type: "authenticate", role: "controller", deviceId: "station-main", secret: "test-secret"}))
		const authenticated = await nextMessage(webSocket)
		expect(authenticated).toMatchObject({version: 2, type: "authenticated", deviceId: "station-main"})
		webSocket.send(JSON.stringify({version: 2, type: "ping", deviceId: "station-main", sessionId: authenticated.sessionId, timestamp: 42}))
		await expect(nextMessage(webSocket)).resolves.toMatchObject({type: "pong", timestamp: 42})

		const second = await openWebSocket(`ws://127.0.0.1:${port}/media`)
		const closed = new Promise(resolve => second.once("close", code => resolve(code)))
		await expect(closed).resolves.toBe(1013)
		webSocket.close()
	})

	it("forwards bytes between a TCP client and a persistent TCP target", async () => {
		const echoServer = net.createServer(socket => socket.pipe(socket))
		const remotePort = await listen(echoServer)
		cleanup.push(() => new Promise(resolve => echoServer.close(() => resolve())))
		const runtime = new AdvancedRuntime({instance: advancedInstance({listenPort: 0, remotePort}), tls: null, log})
		await runtime.start()
		cleanup.push(() => runtime.stop())
		const listenPort = runtime.server.address().port
		const source = net.createConnection({host: "127.0.0.1", port: listenPort})
		cleanup.push(() => { source.destroy() })
		await new Promise((resolve, reject) => { source.once("connect", resolve); source.once("error", reject) })
		await vi.waitFor(() => expect(runtime.health().remoteStatus).toBe("connected"))
		const reply = new Promise((resolve, reject) => { source.once("data", resolve); source.once("error", reject) })
		source.write(Buffer.from("bridge-test"))
		await expect(reply).resolves.toEqual(Buffer.from("bridge-test"))
		expect(runtime.health()).toMatchObject({connected: true, receivedBytes: 11, sentBytes: 11})
	})
})
