<template>
	<section>
		<header class="page-header">
			<div><div class="eyebrow">cloudBridge</div><h1>{{ $t("dashboard.title") }}</h1><p>{{ $t("dashboard.description") }}</p></div>
			<div class="header-actions"><div class="button ghost" v-on:click="stopAll">{{ $t("actions.stopAll") }}</div><div class="button primary" v-on:click="startAll">{{ $t("actions.startAll") }}</div></div>
		</header>
		<div v-if="store.error" class="error-box">{{ store.error }}</div>
		<div class="create-grid">
			<div v-for="kind in kinds" v-bind:key="kind" class="create-tile" v-on:click="create(kind)">
				<strong>{{ $t(`kinds.${kind}`) }}</strong><span>{{ $t(`kindDescriptions.${kind}`) }}</span>
			</div>
		</div>
		<div v-if="!store.loading && !store.items.length" class="empty-state"><h2>{{ $t("dashboard.emptyTitle") }}</h2><p>{{ $t("dashboard.emptyDescription") }}</p></div>
		<div class="instance-grid">
			<instance-card v-for="instance in store.items" v-bind:key="instance.id" v-bind:instance="instance" v-on:start="run('start', $event)" v-on:stop="run('stop', $event)" v-on:restart="run('restart', $event)" v-on:edit="edit" v-on:duplicate="duplicate" v-on:remove="remove" />
		</div>
	</section>
</template>

<script>
import {useInstanceStore} from "../stores/instances.js"
import InstanceCard from "../components/InstanceCard.vue"

export default {
	name: "DashboardPage",
	components: {InstanceCard},
	data() { return {kinds: ["cloudsat", "websocket-serial", "websocket-tcp", "tcp-serial", "tcp-tcp"], refreshTimer: null} },
	computed: {store() { return useInstanceStore() }},
	created() { this.store.load(); this.store.listen() },
	mounted() { this.refreshTimer = window.setInterval(() => this.store.load(), 10_000) },
	beforeUnmount() { if (this.refreshTimer) window.clearInterval(this.refreshTimer) },
	methods: {
		create(kind) { this.$router.push({name: "instance-new", query: {kind}}) },
		edit(id) { this.$router.push({name: "instance-edit", params: {id}}) },
		async run(action, id) { try { await this.store[action](id) } catch (error) { window.alert(error.message) } },
		async startAll() { await this.run("startAll") },
		async stopAll() { await this.run("stopAll") },
		async duplicate(id) {
			try {
				const draft = await window.bridgeAPI.instances.duplicate(id)
				sessionStorage.setItem("cloudBridge.draft", JSON.stringify(draft))
				this.$router.push({name: "instance-new", query: {kind: draft.kind, duplicate: "1"}})
			} catch (error) { window.alert(error.message) }
		},
		async remove(id) { if (!window.confirm(this.$t("dashboard.removeConfirm"))) return; await this.run("remove", id) }
	}
}
</script>
