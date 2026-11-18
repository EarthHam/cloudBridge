import os from "node:os"
import {describe, expect, it, vi} from "vitest"
import managerModule from "../../src/main/instances/InstanceManager.cjs"
import registryModule from "../../src/main/instances/ResourceRegistry.cjs"
import {advancedInstance, cloudSatInstance} from "./helpers.js"

const {InstanceManager, endpointHosts, endpointProtocol, formatEndpointHost} = managerModule
const {ResourceRegistry} = registryModule

const createManager = ({runtimeFactory, instance = advancedInstance()} = {}) => {
	const configStore = {
		getInstances: () => [structuredClone(instance)],
		getInstance: id => id === instance.id ? structuredClone(instance) : null,
		getTlsProfile: () => null
	}
	const log = {info: vi.fn(), warn: vi.fn(), error: vi.fn()}
	return {manager: new InstanceManager({configStore, secretStore: {}, resourceRegistry: new ResourceRegistry(), audioHost: {}, log, runtimeFactory}), log}
}

describe("InstanceManager", () => {
	it("never decrypts ignored TCP keys and preserves TLS for Cloud Sat and WebSocket", () => {
		const {manager} = createManager()
		manager.configStore.getTlsProfile = vi.fn(() => ({certificatePem: "test certificate", privateKeyRef: "test reference"}))
		manager.secretStore.get = vi.fn(() => "test private key")
		for (const kind of ["tcp-tcp", "tcp-serial"]) expect(manager.resolveTls(advancedInstance({kind, tlsProfileId: "legacy-profile"}))).toBe(null)
		expect(manager.configStore.getTlsProfile).not.toHaveBeenCalled()
		expect(manager.secretStore.get).not.toHaveBeenCalled()
		for (const kind of ["websocket-tcp", "websocket-serial", "cloudsat"]) expect(manager.resolveTls({kind, tlsProfileId: "profile"})).toEqual({certificatePem: "test certificate", privateKeyPem: "test private key"})
		expect(manager.secretStore.get).toHaveBeenCalledTimes(3)
	})
	it.each([advancedInstance({bindHost: "0.0.0.0"}), cloudSatInstance({bindHost: "0.0.0.0"})])("advertises only loopback when $kind has no LAN interface", instance => {
		const spy = vi.spyOn(os, "networkInterfaces").mockReturnValue({wan: [{family: "IPv4", internal: false, address: "203.0.113.1", cidr: "203.0.113.1/24"}]})
		try {
			const {manager} = createManager({instance})
			expect(manager.get(instance.id).endpoints).toEqual([`${instance.kind === "cloudsat" ? "ws" : "tcp"}://127.0.0.1:${instance.listenPort}`])
		} finally { spy.mockRestore() }
	})
	it("serializes concurrent starts and stops one runtime", async () => {
		let releaseStart
		const startGate = new Promise(resolve => { releaseStart = resolve })
		const runtime = {start: vi.fn(() => startGate), stop: vi.fn(), health: () => ({connected: false})}
		const factory = vi.fn(() => runtime)
		const {manager} = createManager({runtimeFactory: factory})
		const first = manager.start(advancedInstance().id)
		const second = manager.start(advancedInstance().id)
		releaseStart()
		await Promise.all([first, second])
		expect(factory).toHaveBeenCalledTimes(1)
		await manager.stop(advancedInstance().id)
		expect(runtime.stop).toHaveBeenCalledTimes(1)
	})

	it("cleans up a partially started runtime and releases its lease", async () => {
		const runtime = {start: vi.fn(() => { throw new Error("boom") }), stop: vi.fn(), health: vi.fn()}
		const {manager} = createManager({runtimeFactory: () => runtime})
		await expect(manager.start(advancedInstance().id)).rejects.toThrow("boom")
		expect(runtime.stop).toHaveBeenCalledTimes(1)
		expect(manager.get(advancedInstance().id)).toMatchObject({status: "error"})
	})

	it("waits for an in-flight start before stopAll releases it", async () => {
		let releaseStart
		const runtime = {start: vi.fn(() => new Promise(resolve => { releaseStart = resolve })), stop: vi.fn(), health: vi.fn()}
		const {manager} = createManager({runtimeFactory: () => runtime})
		const starting = manager.start(advancedInstance().id)
		await vi.waitFor(() => expect(runtime.start).toHaveBeenCalled())
		const stopping = manager.stopAll()
		releaseStart()
		await Promise.all([starting, stopping])
		expect(runtime.stop).toHaveBeenCalledTimes(1)
		expect(manager.get(advancedInstance().id).status).toBe("stopped")
	})

	it("uses protocols and hosts that match the listener", () => {
		expect(endpointProtocol(advancedInstance())).toBe("tcp")
		expect(endpointProtocol(advancedInstance({kind: "websocket-tcp", tlsProfileId: "00000000-0000-4000-8000-000000000009"}))).toBe("wss")
		expect(endpointHosts(advancedInstance({bindHost: "127.0.0.1"}))).toEqual(["127.0.0.1"])
		expect(formatEndpointHost("2001:db8::1")).toBe("[2001:db8::1]")
		expect(formatEndpointHost("192.0.2.1")).toBe("192.0.2.1")
	})

	it("defaults every instance kind to all IPv4 interfaces", () => {
		const {manager} = createManager()
		for (const kind of ["cloudsat", "websocket-serial", "websocket-tcp", "tcp-serial", "tcp-tcp"]) {
			expect(manager.defaults(kind).bindHost).toBe("0.0.0.0")
		}
	})

	it("formats an explicit IPv6 listener endpoint with brackets", () => {
		const instance = advancedInstance({bindHost: "::1"})
		const {manager} = createManager({instance})
		expect(manager.get(instance.id).endpoints).toEqual(["tcp://[::1]:17080"])
	})
})
