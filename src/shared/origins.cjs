const canonicalOrigin = value => {
	if (typeof value !== "string" || value === "null" || value.includes("*")) return null
	try {
		const url = new URL(value)
		if (url.username || url.password || url.search || url.hash || url.pathname && url.pathname !== "/") return null
		if (url.protocol === "app:" && url.host === "cloudsat") return "app://cloudsat"
		if (!["http:", "https:"].includes(url.protocol)) return null
		return url.origin
	} catch { return null }
}
module.exports = {canonicalOrigin}
