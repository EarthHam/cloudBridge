import fs from "node:fs/promises"
import path from "node:path"
import {fileURLToPath} from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const iconset = path.join(root, "build/icon.iconset")

const readIcon = name => fs.readFile(path.join(iconset, name))

const createIcns = async () => {
	const definitions = [
		["icp4", "icon_16x16.png"],
		["icp5", "icon_32x32.png"],
		["icp6", "icon_32x32@2x.png"],
		["ic07", "icon_128x128.png"],
		["ic08", "icon_256x256.png"],
		["ic09", "icon_512x512.png"],
		["ic10", "icon_512x512@2x.png"]
	]
	const chunks = await Promise.all(definitions.map(async ([type, filename]) => {
		const png = await readIcon(filename)
		const chunk = Buffer.alloc(8 + png.length)
		chunk.write(type, 0, 4, "ascii")
		chunk.writeUInt32BE(chunk.length, 4)
		png.copy(chunk, 8)
		return chunk
	}))
	const header = Buffer.alloc(8)
	header.write("icns", 0, 4, "ascii")
	header.writeUInt32BE(8 + chunks.reduce((sum, chunk) => sum + chunk.length, 0), 4)
	await fs.writeFile(path.join(root, "build/icon.icns"), Buffer.concat([header, ...chunks]))
}

const createIco = async () => {
	const definitions = [
		[16, "icon_16x16.png"],
		[32, "icon_32x32.png"],
		[64, "icon_32x32@2x.png"],
		[128, "icon_128x128.png"],
		[256, "icon_256x256.png"]
	]
	const images = await Promise.all(definitions.map(async ([size, filename]) => ({size, data: await readIcon(filename)})))
	const header = Buffer.alloc(6)
	header.writeUInt16LE(0, 0)
	header.writeUInt16LE(1, 2)
	header.writeUInt16LE(images.length, 4)
	let offset = header.length + images.length * 16
	const entries = images.map(({size, data}) => {
		const entry = Buffer.alloc(16)
		entry[0] = size === 256 ? 0 : size
		entry[1] = size === 256 ? 0 : size
		entry.writeUInt16LE(1, 4)
		entry.writeUInt16LE(32, 6)
		entry.writeUInt32LE(data.length, 8)
		entry.writeUInt32LE(offset, 12)
		offset += data.length
		return entry
	})
	await fs.writeFile(path.join(root, "build/icon.ico"), Buffer.concat([header, ...entries, ...images.map(image => image.data)]))
}

await Promise.all([createIcns(), createIco()])
console.log("Generated build/icon.icns and build/icon.ico")
