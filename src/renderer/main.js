import {createApp} from "vue"
import {createPinia} from "pinia"
import {createI18n} from "vue-i18n"
import App from "./App.vue"
import router from "./router/index.js"
import zhCN from "./locale/zh-CN.js"
import en from "./locale/en.js"
import "./styles/theme.css"

const savedLocale = localStorage.getItem("cloudBridge.locale") || "zh-CN"
const i18n = createI18n({legacy: true, locale: savedLocale, fallbackLocale: "en", messages: {"zh-CN": zhCN, en}})

createApp(App).use(createPinia()).use(router).use(i18n).mount("#app")
