import {describe, expect, it, vi} from "vitest"
import os from "node:os"
import access from "../../src/main/security/lanAccess.cjs"
import schemas from "../../src/shared/schemas.cjs"
import {advancedInstance} from "./helpers.js"
const {isLanAddress, isAllowedOrigin} = access
const interfaces = {
	wifi: [{address: "192.168.10.20", cidr: "192.168.10.20/24"}],
	vpn: [{address: "10.20.0.2", cidr: "10.20.0.2/16"}],
	ipv6: [{address: "fd12:3456::10", cidr: "fd12:3456::10/64"}],
	public: [{address: "203.0.113.5", cidr: "203.0.113.5/24"}]
}
describe("LAN access policy", () => {
	it.each(["127.0.0.1", "127.5.2.1", "::1", "192.168.10.50", "10.20.15.2", "fd12:3456::20", "::ffff:192.168.10.50", "::ffff:c0a8:a32"])("allows %s", ip => expect(isLanAddress(ip, interfaces)).toBe(true))
	it.each(["192.168.11.5", "10.21.0.2", "172.16.0.1", "203.0.113.20", "8.8.8.8", "2001:db8::1", "fd12:3457::1", "fe80::1%en0", "169.254.1.1", "invalid", "", null])("rejects %s", ip => expect(isLanAddress(ip, interfaces)).toBe(false))
	it("handles 172.16/12 and does not treat all 172 addresses as private", () => {
		const nic = {lan: [{address: "172.20.1.1", cidr: "172.20.1.1/12"}]}
		expect(isLanAddress("172.31.2.2", nic)).toBe(true)
		expect(isLanAddress("172.32.2.2", nic)).toBe(false)
	})
	it("fails closed if network interface discovery fails", () => {
		const spy = vi.spyOn(os, "networkInterfaces").mockImplementation(() => { throw new Error("Unavailable") })
		try { expect(isLanAddress("192.168.1.1")).toBe(false); expect(isLanAddress("::1")).toBe(true) } finally { spy.mockRestore() }
	})
	it("rejects interfaces without a valid prefix", () => {
		expect(isLanAddress("10.1.2.3", {x: [{address: "10.1.2.4", cidr: "10.1.2.4/0"}]})).toBe(false)
		expect(isLanAddress("10.1.2.3", {x: [{address: "10.1.2.4"}]})).toBe(false)
	})
})
describe("WebSocket origin policy", () => {
	it.each([undefined, "https://ptz.cloudsat.cn", "https://m.cloudsat.cn", "https://mapp.cloudsat.cn", "app://cloudsat"])("accepts default origin %s", origin => expect(isAllowedOrigin(origin)).toBe(true))
	it.each(["null", "", "https://ptz.cloudsat.cn.evil.invalid", "https://ptz.cloudsat.cn:8443", "http://ptz.cloudsat.cn", "https://user@ptz.cloudsat.cn", "https://ptz.cloudsat.cn/path", "https://*.cloudsat.cn", "app://evil"])("rejects origin %s", origin => expect(isAllowedOrigin(origin)).toBe(false))
	it("distinguishes a missing field from an explicitly empty allowlist", () => {
		const old = schemas.advancedInstanceSchema.parse(advancedInstance())
		expect(isAllowedOrigin("https://ptz.cloudsat.cn", old.allowedOrigins)).toBe(true)
		const configured = schemas.advancedInstanceSchema.parse(advancedInstance({allowedOrigins: []}))
		expect(isAllowedOrigin("https://ptz.cloudsat.cn", configured.allowedOrigins)).toBe(false)
		expect(isAllowedOrigin(undefined, [])).toBe(true)
		expect(isAllowedOrigin("http://localhost:8081", ["http://localhost:8081"])).toBe(true)
		expect(() => schemas.advancedInstanceSchema.parse(advancedInstance({allowedOrigins: ["*"]}))).toThrow()
	})
})
