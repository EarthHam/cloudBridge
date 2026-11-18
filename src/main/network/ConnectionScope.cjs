const {MAX_CONNECTIONS} = require("../../shared/constants.cjs")

class ConnectionScope {
	constructor({allow = () => true} = {}) {
		this.allow = allow
		this.controller = new AbortController()
		this.sockets = new Set()
		this.webSockets = new Set()
		this.tasks = new Set()
		this.stopping = false
		this.stopPromise = null
	}
	get signal() { return this.controller.signal }
	attach(server) {
		server.on("connection", socket => {
			if (this.stopping || this.sockets.size >= MAX_CONNECTIONS || !this.allow(socket.remoteAddress)) { socket.destroy(); return }
			this.sockets.add(socket)
			socket.once("close", () => this.sockets.delete(socket))
		})
	}
	accept(webSocket) {
		if (this.stopping) { webSocket.terminate(); return false }
		this.webSockets.add(webSocket)
		webSocket.once("close", () => this.webSockets.delete(webSocket))
		return true
	}
	track(task) {
		this.tasks.add(task)
		task.then(() => this.tasks.delete(task), () => this.tasks.delete(task))
		return task
	}
	stop() {
		if (this.stopPromise) return this.stopPromise
		this.stopping = true
		this.controller.abort()
		this.stopPromise = (async () => {
			for (const webSocket of this.webSockets) webSocket.close(1001, "Instance stopped")
			await new Promise(resolve => {
				if (!this.sockets.size) return resolve()
				const timer = setTimeout(() => {
					for (const webSocket of this.webSockets) webSocket.terminate()
					for (const socket of this.sockets) socket.destroy()
					if (!this.sockets.size) resolve()
				}, 1000)
				for (const socket of this.sockets) socket.once("close", () => {
					if (!this.sockets.size) { clearTimeout(timer); resolve() }
				})
			})
			while (this.tasks.size) await Promise.allSettled([...this.tasks])
		})()
		return this.stopPromise
	}
}

module.exports = {ConnectionScope}
