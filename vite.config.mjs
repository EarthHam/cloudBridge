import {defineConfig} from "vite"
import vue from "@vitejs/plugin-vue"
import {fileURLToPath, URL} from "node:url"

export default defineConfig({
	plugins: [vue()],
	base: "./",
	resolve: {
		alias: {
			"@": fileURLToPath(new URL("./src/renderer", import.meta.url))
		}
	},
	build: {
		outDir: "dist",
		emptyOutDir: true
	},
	test: {
		environment: "node",
		include: ["tests/unit/**/*.test.js"],
		coverage: {reporter: ["text", "html"]}
	}
})
