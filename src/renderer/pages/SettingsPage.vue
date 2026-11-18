<template>
	<section>
		<header class="page-header"><div><div class="eyebrow">Application</div><h1>{{ $t("settings.title") }}</h1><p>{{ $t("settings.description") }}</p></div></header>
		<div v-if="saved" class="success-box">{{ $t("settings.saved") }}</div>
		<div v-if="error" class="error-box">{{ error }}</div>
		<div class="card form-card settings-card">
			<label><span>{{ $t("settings.language") }}</span><select v-model="form.locale" v-on:change="changeLocale"><option value="zh-CN">简体中文</option><option value="en">English</option></select></label>
			<label class="check"><input v-model="form.launchAtLogin" type="checkbox"><span>{{ $t("settings.launchAtLogin") }}</span></label>
			<label class="check"><input v-model="form.closeToTray" type="checkbox"><span>{{ $t("settings.closeToTray") }}</span></label>
			<p v-if="version" class="version-line">{{ $t("settings.version") }} {{ version }}</p>
			<div class="button primary" v-on:click="save">{{ $t("actions.save") }}</div>
		</div>
	</section>
</template>

<script>
import {toPlainData} from "../lib/serialization.js"

export default {
	name: "SettingsPage",
	data() { return {form: {locale: "zh-CN", launchAtLogin: false, closeToTray: true}, saved: false, error: "", version: ""} },
	async created() {
		try {
			const [settings, info] = await Promise.all([window.bridgeAPI.settings.get(), window.bridgeAPI.app.getInfo()])
			this.form = settings
			this.version = info.version
		} catch (error) { this.error = error.message }
	},
	methods: {
		changeLocale() { this.$i18n.locale = this.form.locale; localStorage.setItem("cloudBridge.locale", this.form.locale) },
		async save() {
			this.error = ""
			try { this.form = await window.bridgeAPI.settings.update(toPlainData(this.form)); this.saved = true; setTimeout(() => { this.saved = false }, 1800) }
			catch (error) { this.error = error.message }
		}
	}
}
</script>
