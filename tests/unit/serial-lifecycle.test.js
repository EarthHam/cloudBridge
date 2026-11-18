import fs from "node:fs"
import vm from "node:vm"
import {createRequire} from "node:module"
import {describe, expect, it, vi} from "vitest"
const file = new URL("../../src/main/serial/SerialSession.cjs", import.meta.url), actualRequire = createRequire(file)
describe("serial initialization cancellation", () => {
	it("closes a late native port before initialization can escape", async () => {
		let opened, port
		class SerialPort {
			constructor() { port = this; this.close = vi.fn(callback => callback()); this.set = vi.fn((_options, callback) => callback()) }
			open(callback) { opened = callback }
		}
		const module = {exports: {}}
		vm.runInNewContext(fs.readFileSync(file, "utf8"), {module, require: name => name === "serialport" ? {SerialPort} : actualRequire(name), AbortController, Buffer})
		const session = new module.exports.SerialSession({target: {path: "fake", baudRate: 2400, connectionMode: "serial_bridge"}, peer: {onClose: () => vi.fn(), closed: false}, log: {warn: vi.fn()}, instanceId: "test"})
		const starting = session.start(), rejected = expect(starting).rejects.toMatchObject({code: "SESSION_CANCELLED"})
		const closing = session.close(); opened(); await rejected; await closing
		expect(port.close).toHaveBeenCalledTimes(1)
		expect(port.set.mock.calls.every(([lines]) => Object.values(lines).every(value => value === false))).toBe(true)
	})
})
