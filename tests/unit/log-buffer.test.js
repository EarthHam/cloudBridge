import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import {describe, expect, it} from "vitest"
import logs from "../../src/main/logging/LogService.cjs"
describe("bounded diagnostic logging", () => {
	it("coalesces bursts without losing the newest bounded entries", async () => {
		const directory = await fs.mkdtemp(path.join(os.tmpdir(), "cloudsat-log-test-"))
		try {
			const log = new logs.LogService({directory, maxEntries: 20}); await log.load()
			log.info(null, "first", {secret: "hidden"})
			const flush = log.writeQueue
			for (let index = 0; index < 2000; index++) log.info(null, `entry-${index}`)
			expect(log.writeQueue).toBe(flush); expect(log.entries).toHaveLength(20)
			await log.writeQueue
			const lines = (await fs.readFile(log.filePath, "utf8")).trim().split("\n").map(JSON.parse)
			expect(lines).toHaveLength(20); expect(lines.at(-1).message).toBe("entry-1999")
		} finally { await fs.rm(directory, {recursive: true, force: true}) }
	})
})
