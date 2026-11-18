import {describe, expect, it} from "vitest"
import controls from "../../src/main/serial/serialControl.cjs"

const {initializeControlLines, releaseControlLines, applyControlCommand, assertControlMode} = controls
const fakePort = () => {
	const calls = []
	return {calls, set(value, callback) { calls.push(value); callback(null) }}
}

describe("serial control lines", () => {
	it("initializes all supported modes with the required order", async () => {
		const bridge = fakePort()
		await initializeControlLines(bridge, "serial_bridge")
		expect(bridge.calls).toEqual([{dtr: false}, {rts: false}])
		const native = fakePort()
		await initializeControlLines(native, "native_usb_cdc")
		expect(native.calls).toEqual([{rts: true}, {dtr: true}])
		const none = fakePort()
		await initializeControlLines(none, "no_control_lines")
		expect(none.calls).toEqual([])
	})

	it("clears DTR before RTS and recognizes only complete commands", async () => {
		const port = fakePort()
		await releaseControlLines(port, "serial_bridge")
		expect(port.calls).toEqual([{dtr: false}, {rts: false}])
		expect(await applyControlCommand(port, Buffer.from("dtr1"), "serial_bridge")).toBe(true)
		expect(await applyControlCommand(port, Buffer.from("dtr"), "serial_bridge")).toBe(false)
	})

	it("rejects unknown modes", () => expect(() => assertControlMode("other")).toThrowError(expect.objectContaining({code: "INVALID_SERIAL_MODE"})))
})
