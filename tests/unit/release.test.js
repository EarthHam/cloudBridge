import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import {fileURLToPath} from "node:url"
import {execFile} from "node:child_process"
import {promisify} from "node:util"
import {createHash} from "node:crypto"
import {describe, expect, it} from "vitest"

const run = promisify(execFile)
const script = fileURLToPath(new URL("../../scripts/release.mjs", import.meta.url))

describe("release integrity", () => {
	it("rejects a tag that differs from the package version", async () => {
		const {version} = JSON.parse(await fs.readFile("package.json", "utf8"))
		await expect(run(process.execPath, [script, "check-tag"], {env: {...process.env, GITHUB_REF: `refs/tags/v${version}`}})).resolves.toBeDefined()
		await expect(run(process.execPath, [script, "check-tag"], {env: {...process.env, GITHUB_REF: "refs/tags/v999.0.0"}})).rejects.toThrow()
	})

	it("requires every platform asset and hashes only the expected installers", async () => {
		const directory = await fs.mkdtemp(path.join(os.tmpdir(), "cloudsat-release-"))
		try {
			await fs.writeFile(path.join(directory, "package.json"), JSON.stringify({version: "1.2.3"}))
			const names = ["mac-arm64.dmg", "mac-arm64.zip", "mac-x64.dmg", "mac-x64.zip", "win-x64.exe"].map(suffix => `cloudBridge-1.2.3-${suffix}`)
			await fs.writeFile(path.join(directory, names[0]), "installer")
			await expect(run(process.execPath, [script, "checksums", directory], {cwd: directory})).rejects.toThrow()
			await expect(fs.access(path.join(directory, "SHA256SUMS.txt"))).rejects.toThrow()
			await Promise.all(names.map(name => fs.writeFile(path.join(directory, name), "installer")))
			await fs.writeFile(path.join(directory, "support.json"), "private local data")
			await run(process.execPath, [script, "checksums", directory], {cwd: directory})
			const hash = createHash("sha256").update("installer").digest("hex")
			const manifest = await fs.readFile(path.join(directory, "SHA256SUMS.txt"), "utf8")
			expect(manifest).toBe(`${names.sort().map(name => `${hash}  ${name}`).join("\n")}\n`)
			await fs.writeFile(path.join(directory, names[0]), "")
			await expect(run(process.execPath, [script, "checksums", directory], {cwd: directory})).rejects.toThrow()
		} finally { await fs.rm(directory, {recursive: true, force: true}) }
	})
})
