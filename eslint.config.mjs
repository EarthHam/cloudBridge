import js from "@eslint/js"
import pluginVue from "eslint-plugin-vue"

export default [
	{ignores: ["node_modules/**", "dist/**", "release/**", "coverage/**", "test-results/**"]},
	js.configs.recommended,
	...pluginVue.configs["flat/recommended"],
	{
		files: ["**/*.{js,vue,cjs,mjs}"],
		languageOptions: {
			ecmaVersion: "latest",
			sourceType: "module",
			globals: {
				AbortController: "readonly",
				AbortSignal: "readonly",
				AudioContext: "readonly",
				AudioWorkletNode: "readonly",
				AudioWorkletProcessor: "readonly",
				Buffer: "readonly",
				URL: "readonly",
				__dirname: "readonly",
				clearTimeout: "readonly",
				console: "readonly",
				crypto: "readonly",
				document: "readonly",
				localStorage: "readonly",
				module: "readonly",
				navigator: "readonly",
				process: "readonly",
				queueMicrotask: "readonly",
				registerProcessor: "readonly",
				require: "readonly",
				sampleRate: "readonly",
				sessionStorage: "readonly",
				setTimeout: "readonly",
				structuredClone: "readonly",
				window: "readonly"
			}
		},
		rules: {
			"indent": ["error", "tab", {"SwitchCase": 1}],
			"no-console": "off",
			"quotes": ["error", "double", {"avoidEscape": true}],
			"semi": ["error", "never"],
			"vue/html-self-closing": "off",
			"vue/html-indent": ["error", "tab"],
			"vue/max-attributes-per-line": "off",
			"vue/multi-word-component-names": "off",
			"vue/singleline-html-element-content-newline": "off",
			"vue/v-bind-style": "off",
			"vue/v-on-style": "off"
		}
	},
	{
		files: ["**/*.cjs"],
		languageOptions: {sourceType: "commonjs"}
	}
]
