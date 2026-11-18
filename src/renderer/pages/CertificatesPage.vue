<template>
	<section>
		<header class="page-header"><div><div class="eyebrow">TLS</div><h1>{{ $t("certificates.title") }}</h1><p>{{ $t("certificates.description") }}</p></div><div class="button primary" v-on:click="importCertificate">{{ $t("certificates.import") }}</div></header>
		<div v-if="error" class="error-box">{{ error }}</div>
		<div class="list-card card">
			<div v-if="!profiles.length" class="empty-state compact">{{ $t("certificates.empty") }}</div>
			<div v-for="profile in profiles" v-bind:key="profile.id" class="list-row">
				<div><strong>{{ profile.name }}</strong><small>{{ profile.expiresAt || $t("certificates.unknownExpiry") }}</small></div>
				<div class="button ghost danger-text" v-on:click="remove(profile.id)">{{ $t("actions.remove") }}</div>
			</div>
		</div>
	</section>
</template>

<script>
export default {
	name: "CertificatesPage",
	data() { return {profiles: [], error: ""} },
	created() { this.load() },
	methods: {
		async load() { try { this.profiles = await window.bridgeAPI.certificates.list() } catch (error) { this.error = error.message } },
		async importCertificate() { try { await window.bridgeAPI.certificates.import(); await this.load() } catch (error) { this.error = error.message } },
		async remove(id) { if (!window.confirm(this.$t("certificates.removeConfirm"))) return; try { await window.bridgeAPI.certificates.remove(id); await this.load() } catch (error) { this.error = error.message } }
	}
}
</script>
