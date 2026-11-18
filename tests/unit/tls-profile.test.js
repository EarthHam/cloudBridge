import {describe, expect, it} from "vitest"
import tlsModule from "../../src/main/security/tlsProfile.cjs"

const {validateTlsMaterial} = tlsModule

describe("TLS profile validation", () => {
	it("rejects malformed certificate material with a stable error code", () => {
		expect(() => validateTlsMaterial("not a certificate", "not a key")).toThrowError(expect.objectContaining({code: "TLS_INVALID"}))
	})
})
