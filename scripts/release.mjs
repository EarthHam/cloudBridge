import fs from "node:fs/promises"
import {createReadStream} from "node:fs"
import {createHash} from "node:crypto"
import path from "node:path"

const {version} = JSON.parse(await fs.readFile("package.json", "utf8"))
const [command, directory = "release"] = process.argv.slice(2)

if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) throw new Error("Invalid package version")

if (command === "check-tag") {
	const ref = process.env.GITHUB_REF || ""
	if (ref.startsWith("refs/tags/") && ref !== `refs/tags/v${version}`) {
		throw new Error(`Release tag must match package.json: v${version}`)
	}
	console.log(`Release version: ${version}`)
} else if (command === "checksums") {
	const names = [
		`cloudBridge-${version}-mac-arm64.dmg`,
		`cloudBridge-${version}-mac-arm64.zip`,
		`cloudBridge-${version}-mac-x64.dmg`,
		`cloudBridge-${version}-mac-x64.zip`,
		`cloudBridge-${version}-win-x64.exe`
	].sort()
	const lines = []
	for (const name of names) {
		const filename = path.join(directory, name)
		const stat = await fs.stat(filename)
		if (!stat.isFile() || stat.size === 0) throw new Error(`Missing or empty release asset: ${name}`)
		const hash = createHash("sha256")
		for await (const chunk of createReadStream(filename)) hash.update(chunk)
		lines.push(`${hash.digest("hex")}  ${name}`)
	}
	await fs.writeFile(path.join(directory, "SHA256SUMS.txt"), `${lines.join("\n")}\n`)
	console.log(`Verified ${names.length} release assets and wrote SHA256SUMS.txt`)
} else {
	throw new Error("Usage: node scripts/release.mjs check-tag|checksums [directory]")
}
