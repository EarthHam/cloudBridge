// @vitest-environment jsdom
import {flushPromises, mount} from "@vue/test-utils"
import {createI18n} from "vue-i18n"
import {afterEach, describe, expect, it, vi} from "vitest"
import InstanceEditorPage from "../../src/renderer/pages/InstanceEditorPage.vue"
import SerialFields from "../../src/renderer/components/SerialFields.vue"
import zhCN from "../../src/renderer/locale/zh-CN.js"
import en from "../../src/renderer/locale/en.js"
import schemas from "../../src/shared/schemas.cjs"
import {advancedInstance} from "./helpers.js"

afterEach(() => { delete window.bridgeAPI; sessionStorage.clear() })

describe.each([["zh-CN", zhCN], ["en", en]])("CDC forwarding editor (%s)", (locale, messages) => {
	it.each(["websocket-serial", "tcp-serial"])("saves and restores USB CDC for %s", async kind => {
		let saved
		window.bridgeAPI = {
			instances: {
				defaults: vi.fn(async () => advancedInstance({kind, serial: {enabled: true, path: "", baudRate: 9600, connectionMode: "serial_bridge"}, remoteHost: "", remotePort: null})),
				create: vi.fn(async value => { saved = schemas.instanceSchema.parse(value); return saved }),
				get: vi.fn(async () => structuredClone(saved))
			},
			certificates: {list: async () => []},
			devices: {listSerial: async () => [{path: "/dev/tty.cdc", friendlyName: "CDC device"}], listAudio: async () => []}
		}
		const editor = id => mount(InstanceEditorPage, {global: {
			plugins: [createI18n({legacy: false, locale, messages: {[locale]: messages}})],
			mocks: {$route: {params: {id}, query: {kind}}, $router: {push: vi.fn()}}
		}})
		const wrapper = editor()
		await flushPromises()
		const fields = wrapper.findComponent(SerialFields)
		expect(fields.text()).toContain(messages.serialModes.native_usb_cdc)
		await fields.findAll("select")[0].setValue("/dev/tty.cdc")
		await fields.findAll("select")[1].setValue("native_usb_cdc")
		expect(fields.text()).toContain(messages.serialModes.cdcHelp)
		await wrapper.vm.save()
		expect(window.bridgeAPI.instances.create).toHaveBeenCalledTimes(1)
		expect(saved.serial).toEqual({enabled: true, path: "/dev/tty.cdc", baudRate: 9600, connectionMode: "native_usb_cdc"})
		wrapper.unmount()

		const reopened = editor(saved.id)
		await flushPromises()
		expect(reopened.findComponent(SerialFields).findAll("select")[1].element.value).toBe("native_usb_cdc")
		expect(reopened.text()).toContain(messages.serialModes.cdcHelp)
		reopened.unmount()
	})
})
