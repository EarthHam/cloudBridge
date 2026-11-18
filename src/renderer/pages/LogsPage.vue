<template>
	<section>
		<header class="page-header"><div><div class="eyebrow">Diagnostics</div><h1>{{ $t("logs.title") }}</h1><p>{{ $t("logs.description") }}</p></div><div class="header-actions"><div class="button ghost" v-on:click="load">{{ $t("actions.refresh") }}</div><div class="button primary" v-on:click="exportBundle">{{ $t("logs.export") }}</div></div></header>
		<div v-if="exportedPath" class="success-box">{{ $t("logs.exported") }}: {{ exportedPath }}</div>
		<div v-if="error" class="error-box">{{ error }}</div>
		<div class="card log-list">
			<div v-for="(entry, index) in entries" v-bind:key="`${entry.timestamp}-${index}`" v-bind:class="['log-row', `log-${entry.level}`]">
				<time>{{ formatTime(entry.timestamp) }}</time><span>{{ entry.level.toUpperCase() }}</span><strong>{{ entry.instanceId ? entry.instanceId.slice(0, 8) : "APP" }}</strong><p>{{ entry.message }}</p>
			</div>
			<div v-if="!entries.length" class="empty-state compact">{{ $t("logs.empty") }}</div>
		</div>
	</section>
</template>

<script>
export default {
	name: "LogsPage",
	data() { return {entries: [], exportedPath: "", unsubscribe: null, error: ""} },
	created() { this.load(); this.unsubscribe = window.bridgeAPI.events.onLogEntry(entry => { this.entries.push(entry); if (this.entries.length > 500) this.entries.shift() }) },
	beforeUnmount() { if (this.unsubscribe) this.unsubscribe() },
	methods: {
		async load() { try { this.entries = await window.bridgeAPI.logs.list(500) } catch (error) { this.error = error.message } },
		formatTime(value) { return new Date(value).toLocaleTimeString() },
		async exportBundle() { try { this.exportedPath = await window.bridgeAPI.logs.exportSupportBundle() || "" } catch (error) { this.error = error.message } }
	}
}
</script>
