<template>
	<section v-if="form">
		<header class="page-header"><div><div class="eyebrow">{{ $t(`kinds.${form.kind}`) }}</div><h1>{{ editing ? $t("editor.editTitle") : $t("editor.createTitle") }}</h1></div><div class="button ghost" v-on:click="$router.push('/')">{{ $t("actions.cancel") }}</div></header>
		<div v-if="error" class="error-box">{{ error }}</div>
		<form ref="editorForm" class="editor-grid" v-on:submit.prevent="save">
			<div class="card form-card">
				<h2>{{ $t("editor.general") }}</h2>
				<p v-if="form.kind === 'cloudsat'" class="warning">{{ $t("editor.cloudLanOnly") }}</p>
				<label><span>{{ $t("fields.name") }}</span><input v-model.trim="form.name" required maxlength="80"></label>
				<div class="field-row"><label><span>{{ $t("fields.bindHost") }}</span><select v-model="form.bindHost" required><option v-for="option in bindHostOptions" v-bind:key="option.value" v-bind:value="option.value">{{ $t(option.label) }}</option></select></label><label><span>{{ $t("fields.listenPort") }}</span><input v-model.number="form.listenPort" type="number" min="1" max="65535" required></label></div>
				<label v-if="supportsTls"><span>{{ $t("fields.tls") }}</span><select v-model="form.tlsProfileId"><option v-bind:value="null">{{ $t("fields.noTls") }}</option><option v-for="profile in certificates" v-bind:key="profile.id" v-bind:value="profile.id">{{ profile.name }}</option></select></label>
				<p v-else class="warning">{{ $t("editor.plainTcp") }}</p>
				<label class="check"><input v-model="form.autoStart" type="checkbox"><span>{{ $t("fields.autoStart") }}</span></label>
			</div>

			<template v-if="form.kind === 'cloudsat'">
				<div class="card form-card">
					<h2>{{ $t("editor.authentication") }}</h2>
					<label><span>{{ $t("fields.deviceId") }}</span><input v-model.trim="form.deviceId" required></label>
					<label><span>{{ $t("fields.deviceSecret") }}</span><input v-model="form.deviceSecret" type="password" v-bind:placeholder="editing ? $t('fields.keepSecret') : ''"></label>
					<label class="check"><input v-model="form.authenticationRequired" type="checkbox"><span>{{ $t("fields.requireAuth") }}</span></label>
					<p v-if="!form.authenticationRequired" class="warning">{{ $t("editor.authWarning") }}</p>
				</div>
				<div class="card form-card">
					<div class="section-title"><h2>{{ $t("editor.audio") }}</h2><label class="switch"><input v-model="form.audio.enabled" type="checkbox"><span></span></label></div>
					<template v-if="form.audio.enabled">
						<label><span>{{ $t("fields.audioInput") }}</span><select v-model="form.audio.inputDeviceId" required><option value="">{{ $t("fields.selectDevice") }}</option><option v-for="device in audioInputs" v-bind:key="device.deviceId" v-bind:value="device.deviceId">{{ device.label }}</option></select></label>
						<label><span>{{ $t("fields.audioOutput") }}</span><select v-model="form.audio.outputDeviceId" required><option value="">{{ $t("fields.selectDevice") }}</option><option v-for="device in audioOutputs" v-bind:key="device.deviceId" v-bind:value="device.deviceId">{{ device.label }}</option></select></label>
						<div class="button ghost" v-on:click="testAudio">{{ $t("actions.testAudio") }}</div>
					</template>
				</div>
				<div v-for="bridgeName in bridgeNames" v-bind:key="bridgeName" class="card form-card">
					<div class="section-title"><h2>{{ $t(`bridges.${bridgeName}`) }}</h2><label class="switch"><input v-bind:checked="Boolean(form.serialBridges[bridgeName]?.enabled)" type="checkbox" v-on:change="toggleBridge(bridgeName, $event.target.checked)"><span></span></label></div>
					<serial-fields v-if="form.serialBridges[bridgeName]?.enabled" v-model="form.serialBridges[bridgeName]" v-bind:ports="serialPorts" />
				</div>
			</template>

			<div v-else class="card form-card">
				<h2>{{ $t("editor.forwarding") }}</h2>
				<p class="warning">{{ $t("editor.lanOnly") }}</p>
				<label v-if="form.kind.startsWith('websocket-')"><span>{{ $t("fields.allowedOrigins") }}</span><textarea v-model="allowedOriginsText" rows="4" /><span>{{ $t("editor.originsHelp") }}</span></label>
				<serial-fields v-if="form.kind.endsWith('serial')" v-model="form.serial" v-bind:ports="serialPorts" />
				<template v-if="form.kind.endsWith('tcp')"><label><span>{{ $t("fields.remoteHost") }}</span><input v-model.trim="form.remoteHost" required></label><label><span>{{ $t("fields.remotePort") }}</span><input v-model.number="form.remotePort" type="number" min="1" max="65535" required></label></template>
			</div>

			<div class="editor-actions"><div class="button ghost" v-on:click="$router.push('/')">{{ $t("actions.cancel") }}</div><div class="button primary" v-bind:class="{disabled: saving}" v-on:click="save">{{ saving ? $t("actions.saving") : $t("actions.save") }}</div></div>
		</form>
	</section>
</template>

<script>
import SerialFields from "../components/SerialFields.vue"
import {toPlainData} from "../lib/serialization.js"

export default {
	name: "InstanceEditorPage",
	components: {SerialFields},
	data() {
		return {
			form: null,
			certificates: [],
			serialPorts: [],
			audioDevices: [],
			bridgeNames: ["radio", "ptz", "sdr"],
			bindHostOptions: [
				{value: "::", label: "bindHosts.lanDualStack"},
				{value: "0.0.0.0", label: "bindHosts.lanIpv4"},
				{value: "::1", label: "bindHosts.localIpv6"},
				{value: "127.0.0.1", label: "bindHosts.localIpv4"}
			],
			error: "",
			saving: false
		}
	},
	computed: {
		supportsTls() { return this.form && !this.form.kind.startsWith("tcp-") },
		allowedOriginsText: {
			get() { return (this.form.allowedOrigins || []).join("\n") },
			set(value) { this.form.allowedOrigins = value.split("\n").map(item => item.trim()).filter(Boolean) }
		},
		editing() { return Boolean(this.$route.params.id) },
		audioInputs() { return this.audioDevices.filter(item => item.kind === "audioinput") },
		audioOutputs() { return this.audioDevices.filter(item => item.kind === "audiooutput") }
	},
	async created() {
		try {
			const draft = sessionStorage.getItem("cloudBridge.draft")
			if (!this.editing && draft) { this.form = JSON.parse(draft); sessionStorage.removeItem("cloudBridge.draft") }
			else this.form = this.editing ? await window.bridgeAPI.instances.get(this.$route.params.id) : await window.bridgeAPI.instances.defaults(this.$route.query.kind || "cloudsat")
			this.certificates = await window.bridgeAPI.certificates.list()
			this.serialPorts = await window.bridgeAPI.devices.listSerial()
			this.audioDevices = await window.bridgeAPI.devices.listAudio()
		} catch (error) { this.error = error.message }
	},
	methods: {
		toggleBridge(name, enabled) { this.form.serialBridges[name] = enabled ? {enabled: true, path: "", baudRate: name === "ptz" ? 2400 : 19200, connectionMode: "serial_bridge"} : null },
		async testAudio() { try { await window.bridgeAPI.devices.testAudio(toPlainData(this.form.audio)); window.alert(this.$t("editor.audioTestSuccess")); this.audioDevices = await window.bridgeAPI.devices.listAudio() } catch (error) { this.error = error.message } },
		async save() {
			if (this.saving) return
			if (!this.$refs.editorForm.reportValidity()) return
			if (this.form.kind === "cloudsat" && !this.form.authenticationRequired && !["127.0.0.1", "::1", "localhost"].includes(this.form.bindHost) && !window.confirm(this.$t("editor.insecureConfirm"))) return
			if (this.editing && ["running", "degraded"].includes(this.form.status) && !window.confirm(this.$t("editor.restartConfirm"))) return
			this.saving = true; this.error = ""
			try {
				const form = toPlainData(this.form)
				if (!this.supportsTls) form.tlsProfileId = null
				const saved = this.editing ? await window.bridgeAPI.instances.update(this.form.id, form) : await window.bridgeAPI.instances.create(form)
				if (saved.generatedSecret) window.alert(`${this.$t("fields.deviceSecret")}: ${saved.generatedSecret}`)
				this.$router.push("/")
			} catch (error) { this.error = error.message }
			finally { this.saving = false }
		}
	}
}
</script>
