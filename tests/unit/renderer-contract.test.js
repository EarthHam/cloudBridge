import fs from "node:fs/promises"
import path from "node:path"
import {fileURLToPath} from "node:url"
import {describe, expect, it} from "vitest"
import zhCN from "../../src/renderer/locale/zh-CN.js"
import en from "../../src/renderer/locale/en.js"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const flatten = (value, prefix = "") => Object.entries(value).flatMap(([key, item]) => {
	const name = prefix ? `${prefix}.${key}` : key
	return item && typeof item === "object" ? flatten(item, name) : [name]
})

describe("renderer contract", () => {
	it("keeps Chinese and English translation keys synchronized", () => expect(flatten(zhCN).sort()).toEqual(flatten(en).sort()))

	it("uses Vue Options API in every single-file component", async () => {
		const renderer = path.join(root, "src/renderer")
		const directories = [renderer, path.join(renderer, "components"), path.join(renderer, "pages")]
		const files = (await Promise.all(directories.map(directory => fs.readdir(directory).then(names => names.filter(name => name.endsWith(".vue")).map(name => path.join(directory, name)))))).flat()
		for (const file of files) {
			const source = await fs.readFile(file, "utf8")
			expect(source, file).toContain("export default {")
			expect(source, file).not.toContain("<script setup")
		}
	})
})
