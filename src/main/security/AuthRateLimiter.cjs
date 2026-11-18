const {AppError} = require("../errors/AppError.cjs")

class AuthRateLimiter {
	constructor({attempts = 8, windowMs = 60_000, maxPending = 16, perSource = 4, maxSources = 1024, now = Date.now} = {}) {
		Object.assign(this, {attempts, windowMs, maxPending, perSource, maxSources, now})
		this.history = new Map()
		this.pending = 0
	}
	prune() {
		const now = this.now()
		for (const [source, entry] of this.history) {
			entry.failures = entry.failures.filter(timestamp => now - timestamp < this.windowMs)
			if (!entry.pending && !entry.failures.length) this.history.delete(source)
		}
	}
	reserve(source) {
		this.prune()
		const entry = this.history.get(source) || {failures: [], pending: 0}
		if (this.pending >= this.maxPending || entry.pending >= this.perSource || entry.failures.length + entry.pending >= this.attempts || !this.history.has(source) && this.history.size >= this.maxSources) {
			throw new AppError("RATE_LIMITED", "Too many authentication attempts")
		}
		this.history.set(source, entry)
		entry.pending++
		this.pending++
		let released = false
		return ({failed = false} = {}) => {
			if (released) return
			released = true
			entry.pending--
			this.pending--
			if (failed) entry.failures.push(this.now())
			if (!entry.pending && !entry.failures.length) this.history.delete(source)
		}
	}
}
module.exports = {AuthRateLimiter}
