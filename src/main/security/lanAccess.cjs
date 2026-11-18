const net = require("node:net")
const os = require("node:os")
const {canonicalOrigin} = require("../../shared/origins.cjs")
const {DEFAULT_ALLOWED_ORIGINS} = require("../../shared/constants.cjs")

const parseAddress = address => {
	if (typeof address !== "string") return null
	const value = address.split("%")[0]
	const family = net.isIP(value)
	if (family === 4) return {family, value: value.split(".").reduce((result, part) => result * 256n + BigInt(part), 0n)}
	if (family !== 6) return null
	let expanded = value.toLowerCase()
	if (expanded.includes(".")) {
		const colon = expanded.lastIndexOf(":")
		const ipv4 = parseAddress(expanded.slice(colon + 1)).value
		expanded = `${expanded.slice(0, colon)}:${(ipv4 >> 16n).toString(16)}:${(ipv4 & 65535n).toString(16)}`
	}
	const halves = expanded.split("::")
	const left = halves[0] ? halves[0].split(":") : []
	const right = halves[1] ? halves[1].split(":") : []
	const parts = halves.length === 2 ? [...left, ...Array(8 - left.length - right.length).fill("0"), ...right] : left
	const numeric = parts.reduce((result, part) => (result << 16n) + BigInt(`0x${part}`), 0n)
	if (numeric >> 32n === 65535n) return {family: 4, value: numeric & 0xffffffffn}
	return {family, value: numeric}
}

const isLoopback = address => address.family === 4 ? address.value >> 24n === 127n : address.value === 1n
const isPrivate = address => address.family === 4
	? address.value >> 24n === 10n || address.value >> 20n === 2753n || address.value >> 16n === 49320n
	: address.value >> 121n === 126n

const isLanAddress = (source, interfaces = null) => {
	const address = parseAddress(source)
	if (!address) return false
	if (isLoopback(address)) return true
	if (!isPrivate(address)) return false
	try {
		return Object.values(interfaces || os.networkInterfaces()).flat().some(item => {
			if (!item || item.internal || !item.cidr) return false
			const local = parseAddress(item.address)
			if (!local || local.family !== address.family || !isPrivate(local)) return false
			const prefix = Number(item.cidr.split("/")[1])
			const bits = address.family === 4 ? 32 : 128
			if (!Number.isInteger(prefix) || prefix < 1 || prefix > bits) return false
			const shift = BigInt(bits - prefix)
			return address.value >> shift === local.value >> shift
		})
	} catch { return false }
}


const isAllowedOrigin = (origin, allowed = DEFAULT_ALLOWED_ORIGINS) => origin === undefined || Boolean(canonicalOrigin(origin) && allowed.some(item => canonicalOrigin(item) === canonicalOrigin(origin)))

module.exports = {parseAddress, isPrivate, isLanAddress, canonicalOrigin, isAllowedOrigin}
