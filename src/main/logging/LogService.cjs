const fs = require("node:fs/promises")
const path = require("node:path")

class LogService {
	constructor({directory, maxEntries = 2000}) {
		this.directory = directory
		this.filePath = path.join(directory, "bridge.log")
		this.maxEntries = maxEntries
		this.entries = []
		this.listeners = new Set()
		this.writeQueue = Promise.resolve()
		this.flushing = false
		this.dirty = false
	}
	async load() {
		await fs.mkdir(this.directory, {recursive: true})
		try {
			const content = await fs.readFile(this.filePath, "utf8")
			this.entries = content.trim().split("\n").filter(Boolean).slice(-this.maxEntries).map(line => {
				try { return JSON.parse(line) } catch { return null }
			}).filter(Boolean)
		} catch (error) {
			if (error.code !== "ENOENT") throw error
		}
	}
	info(instanceId, message, details) { return this.write("info", instanceId, message, details) }
	warn(instanceId, message, details) { return this.write("warn", instanceId, message, details) }
	error(instanceId, message, details) { return this.write("error", instanceId, message, details) }
	write(level, instanceId, message, details = null) {
		const entry = {timestamp: new Date().toISOString(), level, instanceId: instanceId || null, message: String(message), ...(details ? {details: this.sanitize(details)} : {})}
		this.entries.push(entry)
		if (this.entries.length > this.maxEntries) this.entries.splice(0, this.entries.length - this.maxEntries)
		this.dirty = true
		this.scheduleFlush()
		this.listeners.forEach(listener => listener(entry))
		return entry
	}
	scheduleFlush() {
		if (this.flushing) return
		this.flushing = true
		this.writeQueue = this.flush().finally(() => { this.flushing = false; if (this.dirty) this.scheduleFlush() })
	}
	async flush() {
		while (this.dirty) {
			this.dirty = false
			const content = `${this.entries.map(item => JSON.stringify(item)).join("\n")}\n`
			try { await fs.writeFile(this.filePath, content, {encoding: "utf8", mode: 0o600}) } catch { /* Logging must not interrupt forwarding. */ }
		}
	}
	sanitize(value) {
		if (!value || typeof value !== "object") return value
		const copy = Array.isArray(value) ? [] : {}
		Object.entries(value).forEach(([key, item]) => { copy[key] = /secret|privateKey|password/i.test(key) ? "[REDACTED]" : this.sanitize(item) })
		return copy
	}
	list(limit = 300) { return structuredClone(this.entries.slice(-Math.max(1, Math.min(limit, 1000)))) }
	onEntry(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener) }
}

module.exports = {LogService}
