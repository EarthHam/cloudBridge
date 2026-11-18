import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import {fileURLToPath} from "node:url"
import {execFile} from "node:child_process"
import {promisify} from "node:util"
import electronPath from "electron"
import {expect, test} from "@playwright/test"
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")

test("runs bounded audio IPC and releases a synthetic microphone session", async () => {
	const userData = await fs.mkdtemp(path.join(os.tmpdir(), "cloudsat-audio-e2e-"))
	try {
		// Run without a DevTools attachment: paused worklet targets can stall addModule().
		const {stdout} = await promisify(execFile)(electronPath, [path.join(projectRoot, "tests/e2e/fixtures/audio-host.cjs")], {cwd: projectRoot, env: {...process.env, CLOUD_BRIDGE_USER_DATA: userData}, timeout: 30_000})
		const result = stdout.trim().split("\n").map(line => { try { return JSON.parse(line) } catch { return null } }).find(item => item?.audioSmoke)
		expect(result).toMatchObject({audioSmoke: "passed", playbackAcknowledged: true, sessions: 0, electron: "45.3.2", node: "24.22.2"})
	} finally { await fs.rm(userData, {recursive: true, force: true}) }
})
