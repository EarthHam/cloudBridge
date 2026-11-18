import {createRouter, createWebHashHistory} from "vue-router"
import DashboardPage from "../pages/DashboardPage.vue"
import InstanceEditorPage from "../pages/InstanceEditorPage.vue"
import CertificatesPage from "../pages/CertificatesPage.vue"
import LogsPage from "../pages/LogsPage.vue"
import SettingsPage from "../pages/SettingsPage.vue"
import OnboardingPage from "../pages/OnboardingPage.vue"

export default createRouter({
	history: createWebHashHistory(),
	routes: [
		{path: "/welcome", name: "onboarding", component: OnboardingPage},
		{path: "/", name: "dashboard", component: DashboardPage},
		{path: "/instances/new", name: "instance-new", component: InstanceEditorPage},
		{path: "/instances/:id", name: "instance-edit", component: InstanceEditorPage},
		{path: "/certificates", name: "certificates", component: CertificatesPage},
		{path: "/logs", name: "logs", component: LogsPage},
		{path: "/settings", name: "settings", component: SettingsPage}
	]
})
