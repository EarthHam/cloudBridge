import {describe, expect, it} from "vitest"
import {reactive} from "vue"
import {toPlainData} from "../../src/renderer/lib/serialization.js"

describe("renderer IPC serialization", () => {
	it("removes Vue reactive proxies before crossing contextBridge", () => {
		const form = reactive({name: "Bridge", nested: {port: 8000}})
		const plain = toPlainData(form)
		expect(plain).toEqual({name: "Bridge", nested: {port: 8000}})
		expect(plain).not.toBe(form)
		expect(plain.nested).not.toBe(form.nested)
	})
})
