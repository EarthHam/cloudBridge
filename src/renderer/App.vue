<template>
	<div class="app-shell">
		<aside v-if="$route.name !== 'onboarding'" class="sidebar">
			<div class="brand">
				<div class="brand-mark">CB</div>
				<div><strong>cloudBridge</strong><small>{{ $t("app.subtitle") }}</small></div>
			</div>
			<nav>
				<router-link to="/">{{ $t("nav.dashboard") }}</router-link>
				<router-link to="/certificates">{{ $t("nav.certificates") }}</router-link>
				<router-link to="/logs">{{ $t("nav.logs") }}</router-link>
				<router-link to="/settings">{{ $t("nav.settings") }}</router-link>
			</nav>
			<div class="sidebar-footer">v{{ version }}</div>
		</aside>
		<main v-bind:class="['content', {'content-full': $route.name === 'onboarding'}]"><router-view /></main>
	</div>
</template>

<script>
export default {
	name: "App",
	data() { return {version: ""} },
	async created() {
		try {
			const [info, settings] = await Promise.all([window.bridgeAPI.app.getInfo(), window.bridgeAPI.settings.get()])
			this.version = info.version
			if (!settings.onboardingComplete && this.$route.name !== "onboarding") await this.$router.replace({name: "onboarding"})
		} catch (error) { console.error("Unable to initialize application shell", error) }
	}
}
</script>
