<template>
	<section class="onboarding">
		<div class="onboarding-hero card">
			<div class="brand-mark large">CB</div>
			<div class="eyebrow">cloudBridge</div>
			<h1>{{ $t("onboarding.title") }}</h1>
			<p>{{ $t("onboarding.description") }}</p>
			<div class="onboarding-grid">
				<div><strong>{{ $t("onboarding.instancesTitle") }}</strong><span>{{ $t("onboarding.instancesBody") }}</span></div>
				<div><strong>{{ $t("onboarding.backgroundTitle") }}</strong><span>{{ $t("onboarding.backgroundBody") }}</span></div>
				<div><strong>{{ $t("onboarding.securityTitle") }}</strong><span>{{ $t("onboarding.securityBody") }}</span></div>
			</div>
			<div v-if="error" class="error-box">{{ error }}</div>
			<div class="button primary" v-on:click="finish">{{ $t("onboarding.continue") }}</div>
		</div>
	</section>
</template>

<script>
export default {
	name: "OnboardingPage",
	data() { return {error: "", saving: false} },
	methods: {
		async finish() {
			if (this.saving) return
			this.saving = true
			try {
				await window.bridgeAPI.settings.update({onboardingComplete: true})
				await this.$router.replace("/")
			} catch (error) { this.error = error.message }
			finally { this.saving = false }
		}
	}
}
</script>
