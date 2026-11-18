import {defineStore} from "pinia"

export const useInstanceStore = defineStore("instances", {
	state: () => ({items: [], loading: false, error: "", unsubscribe: null}),
	getters: {
		runningItems(state) { return state.items.filter(item => ["running", "degraded"].includes(item.status)) }
	},
	actions: {
		async load() {
			this.loading = true
			this.error = ""
			try { this.items = await window.bridgeAPI.instances.list() }
			catch (error) { this.error = error.message }
			finally { this.loading = false }
		},
		listen() {
			if (this.unsubscribe) return
			this.unsubscribe = window.bridgeAPI.events.onInstanceStatus(instance => {
				const index = this.items.findIndex(item => item.id === instance.id)
				if (index < 0) this.items.push(instance)
				else this.items.splice(index, 1, instance)
			})
		},
		async start(id) { await window.bridgeAPI.instances.start(id); await this.load() },
		async stop(id) { await window.bridgeAPI.instances.stop(id); await this.load() },
		async restart(id) { await window.bridgeAPI.instances.restart(id); await this.load() },
		async remove(id) { await window.bridgeAPI.instances.remove(id); await this.load() },
		async startAll() { await window.bridgeAPI.instances.startAll(); await this.load() },
		async stopAll() { await window.bridgeAPI.instances.stopAll(); await this.load() }
	}
})
