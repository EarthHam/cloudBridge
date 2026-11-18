import {describe, expect, it} from "vitest"
import resources from "../../src/main/instances/ResourceRegistry.cjs"
import {advancedInstance, cloudSatInstance} from "./helpers.js"

const {ResourceRegistry, hostsConflict} = resources

describe("ResourceRegistry", () => {
	it("detects wildcard listener conflicts", () => {
		expect(hostsConflict("0.0.0.0", "127.0.0.1")).toBe(true)
		expect(hostsConflict("192.0.2.1", "192.0.2.2")).toBe(false)
		const registry = new ResourceRegistry()
		registry.acquire(advancedInstance({bindHost: "0.0.0.0"}))
		expect(() => registry.acquire(advancedInstance({id: "00000000-0000-4000-8000-000000000004"}))).toThrowError(expect.objectContaining({code: "PORT_CONFLICT"}))
	})

	it("detects serial and audio leases owned by other instances", () => {
		const registry = new ResourceRegistry()
		registry.acquire(cloudSatInstance({audio: {enabled: true, inputDeviceId: "mic-1", outputDeviceId: "speaker-1"}, serialBridges: {radio: {enabled: true, path: "/dev/radio", baudRate: 9600, connectionMode: "serial_bridge"}, ptz: null, sdr: null}}))
		expect(() => registry.acquire(advancedInstance({id: "00000000-0000-4000-8000-000000000004", listenPort: 17081, kind: "tcp-serial", serial: {enabled: true, path: "/dev/radio", baudRate: 9600, connectionMode: "serial_bridge"}, remoteHost: "", remotePort: null}))).toThrowError(expect.objectContaining({code: "SERIAL_CONFLICT"}))
		expect(() => registry.acquire(cloudSatInstance({id: "00000000-0000-4000-8000-000000000005", listenPort: 8001, deviceId: "second", audio: {enabled: true, inputDeviceId: "mic-1", outputDeviceId: "speaker-2"}}))).toThrowError(expect.objectContaining({code: "AUDIO_CONFLICT"}))
	})

	it("rejects the same serial port twice inside one Cloud Sat instance", () => {
		const target = {enabled: true, path: "/dev/shared", baudRate: 9600, connectionMode: "serial_bridge"}
		expect(() => new ResourceRegistry().acquire(cloudSatInstance({serialBridges: {radio: target, ptz: {...target}, sdr: null}}))).toThrowError(expect.objectContaining({code: "SERIAL_CONFLICT"}))
	})
})
