import {describe, expect, it} from "vitest"
import schemas from "../../src/shared/schemas.cjs"
import {advancedInstance, cloudSatInstance} from "./helpers.js"

const {instanceSchema, applicationConfigSchema} = schemas

describe("instance schemas", () => {
	it("accepts all five instance kinds", () => {
		expect(instanceSchema.parse(cloudSatInstance()).kind).toBe("cloudsat")
		for (const kind of ["websocket-serial", "tcp-serial"]) {
			const value = advancedInstance({kind, serial: {enabled: true, path: "/dev/tty.test", baudRate: 9600, connectionMode: "serial_bridge"}, remoteHost: "", remotePort: null})
			expect(instanceSchema.parse(value).kind).toBe(kind)
		}
		for (const kind of ["websocket-tcp", "tcp-tcp"]) expect(instanceSchema.parse(advancedInstance({kind})).kind).toBe(kind)
	})

	it("requires selected audio devices when audio is enabled", () => {
		const result = instanceSchema.safeParse(cloudSatInstance({audio: {enabled: true, inputDeviceId: "", outputDeviceId: ""}}))
		expect(result.success).toBe(false)
		expect(result.error.issues.map(issue => issue.path.join("."))).toEqual(expect.arrayContaining(["audio.inputDeviceId", "audio.outputDeviceId"]))
	})

	it("requires the target matching an advanced forwarding kind", () => {
		expect(instanceSchema.safeParse(advancedInstance({kind: "tcp-serial", serial: null, remoteHost: "", remotePort: null})).success).toBe(false)
		expect(instanceSchema.safeParse(advancedInstance({kind: "websocket-tcp", remoteHost: "", remotePort: null})).success).toBe(false)
	})

	it("only accepts the four supported listener addresses", () => {
		for (const bindHost of ["::", "0.0.0.0", "::1", "127.0.0.1"]) {
			expect(instanceSchema.safeParse(advancedInstance({bindHost})).success).toBe(true)
		}
		expect(instanceSchema.safeParse(advancedInstance({bindHost: "192.0.2.10"})).success).toBe(false)
		expect(instanceSchema.safeParse(advancedInstance({bindHost: "localhost"})).success).toBe(false)
	})

	it("fills application settings defaults", () => {
		const config = applicationConfigSchema.parse({schemaVersion: 1, instances: [], tlsProfiles: [], settings: {}})
		expect(config.settings).toEqual({locale: "zh-CN", launchAtLogin: false, closeToTray: true, onboardingComplete: false})
	})
})
