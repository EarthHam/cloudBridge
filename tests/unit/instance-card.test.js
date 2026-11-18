// @vitest-environment jsdom
import {flushPromises, mount} from "@vue/test-utils"
import {beforeEach, describe, expect, it, vi} from "vitest"
import InstanceCard from "../../src/renderer/components/InstanceCard.vue"
import QRCode from "qrcode"

vi.mock("qrcode", () => ({default: {toDataURL: vi.fn(async address => `qr:${address}`)}}))

const instance = endpoints => ({
	id: "instance-1",
	name: "Bridge",
	kind: "tcp-tcp",
	status: "running",
	bindHost: "::",
	listenPort: 17080,
	endpoints,
	error: null,
	health: null
})

describe("InstanceCard", () => {
	beforeEach(() => QRCode.toDataURL.mockClear())

	it("regenerates an open QR code when the endpoint changes", async () => {
		const wrapper = mount(InstanceCard, {props: {instance: instance(["tcp://192.0.2.1:17080"])}, global: {mocks: {$t: key => key}}})
		await wrapper.vm.toggleQr()
		expect(wrapper.vm.qrData).toBe("qr:tcp://192.0.2.1:17080")

		await wrapper.setProps({instance: instance(["tcp://[2001:db8::1]:17080"])})
		await flushPromises()
		expect(wrapper.vm.qrData).toBe("qr:tcp://[2001:db8::1]:17080")
	})

	it("shows every IPv4 and IPv6 endpoint", () => {
		const wrapper = mount(InstanceCard, {
			props: {instance: instance(["tcp://192.0.2.1:17080", "tcp://[2001:db8::1]:17080"])},
			global: {mocks: {$t: key => key}}
		})
		expect(wrapper.findAll(".endpoint").map(item => item.text())).toEqual(["tcp://192.0.2.1:17080", "tcp://[2001:db8::1]:17080"])
	})
})
