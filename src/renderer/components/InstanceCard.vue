<template>
	<article class="card instance-card">
		<div class="instance-head">
			<div>
				<div class="eyebrow">{{ kindLabel }}</div>
				<h3>{{ instance.name }}</h3>
			</div>
			<span v-bind:class="['status', `status-${instance.status}`]">{{ $t(`status.${instance.status}`) }}</span>
		</div>
		<div class="endpoints"><div v-for="endpoint in displayEndpoints" v-bind:key="endpoint" class="endpoint">{{ endpoint }}</div></div>
		<div v-if="qrData" class="connection-code"><img v-bind:src="qrData" alt="Connection QR code"><code>{{ connectionAddress }}</code></div>
		<div v-if="instance.error" class="error-box">{{ instance.error.message }}</div>
		<div v-if="instance.health" class="metrics">
			<span>{{ $t("dashboard.clients") }}: {{ instance.health.activeSessions ?? (instance.health.connected ? 1 : 0) }}</span>
			<span v-if="instance.health.receivedBytes !== undefined">RX {{ instance.health.receivedBytes }} B</span>
			<span v-if="instance.health.sentBytes !== undefined">TX {{ instance.health.sentBytes }} B</span>
		</div>
		<div class="card-actions">
			<div v-if="instance.status === 'stopped' || instance.status === 'error'" class="button primary" v-on:click="$emit('start', instance.id)">{{ $t("actions.start") }}</div>
			<div v-else class="button danger" v-on:click="$emit('stop', instance.id)">{{ $t("actions.stop") }}</div>
			<div v-if="instance.status === 'running' || instance.status === 'degraded'" class="button ghost" v-on:click="$emit('restart', instance.id)">{{ $t("actions.restart") }}</div>
			<div class="button ghost" v-on:click="$emit('edit', instance.id)">{{ $t("actions.edit") }}</div>
			<div class="button ghost" v-on:click="$emit('duplicate', instance.id)">{{ $t("actions.duplicate") }}</div>
			<div class="button ghost" v-on:click="toggleQr">{{ $t("actions.qrCode") }}</div>
			<div class="button ghost" v-on:click="copyAddress">{{ $t("actions.copy") }}</div>
			<div class="button ghost danger-text" v-on:click="$emit('remove', instance.id)">{{ $t("actions.remove") }}</div>
		</div>
	</article>
</template>

<script>
import QRCode from "qrcode"

export default {
	name: "InstanceCard",
	props: {instance: {type: Object, required: true}},
	emits: ["start", "stop", "restart", "edit", "duplicate", "remove"],
	data() { return {qrData: ""} },
	computed: {
		kindLabel() { return this.$t(`kinds.${this.instance.kind}`) },
		displayEndpoints() { return this.instance.endpoints?.length ? this.instance.endpoints : [`${this.instance.bindHost}:${this.instance.listenPort}`] },
		connectionAddress() {
			const endpoint = this.displayEndpoints[0]
			return this.instance.kind === "cloudsat" ? `${endpoint}/media` : endpoint
		}
	},
	watch: {
		connectionAddress() { this.refreshQrCode() }
	},
	methods: {
		async refreshQrCode() {
			if (!this.qrData) return
			const address = this.connectionAddress
			const qrData = await QRCode.toDataURL(address, {margin: 1, width: 180})
			if (address === this.connectionAddress && this.qrData) this.qrData = qrData
		},
		async toggleQr() { this.qrData = this.qrData ? "" : await QRCode.toDataURL(this.connectionAddress, {margin: 1, width: 180}) },
		async copyAddress() { await navigator.clipboard.writeText(this.connectionAddress) }
	}
}
</script>
