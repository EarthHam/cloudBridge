import {EventEmitter} from "node:events"
import {describe, expect, it} from "vitest"
import serverHelpers from "../../src/main/network/serverHelpers.cjs"

const {listen} = serverHelpers

class FakeServer extends EventEmitter {
	constructor(outcomes) {
		super()
		this.outcomes = [...outcomes]
		this.calls = []
	}

	listen(options) {
		this.calls.push(options)
		const outcome = this.outcomes.shift()
		queueMicrotask(() => {
			if (outcome === "listening") this.emit("listening")
			else this.emit("error", Object.assign(new Error(outcome), {code: outcome}))
		})
	}
}

describe("server listener", () => {
	it("explicitly enables dual stack for the IPv6 wildcard", async () => {
		const server = new FakeServer(["listening"])
		await expect(listen(server, "::", 8000)).resolves.toEqual({host: "::"})
		expect(server.calls).toEqual([{host: "::", port: 8000, ipv6Only: false}])
	})

	it.each(["EAFNOSUPPORT", "EADDRNOTAVAIL"])("falls back to IPv4 for %s", async code => {
		const server = new FakeServer([code, "listening"])
		await expect(listen(server, "::", 8000)).resolves.toEqual({host: "0.0.0.0"})
		expect(server.calls).toEqual([
			{host: "::", port: 8000, ipv6Only: false},
			{host: "0.0.0.0", port: 8000}
		])
	})

	it("does not hide unrelated listener failures", async () => {
		const server = new FakeServer(["EACCES"])
		await expect(listen(server, "::", 8000)).rejects.toMatchObject({code: "EACCES"})
		expect(server.calls).toHaveLength(1)
	})
})
