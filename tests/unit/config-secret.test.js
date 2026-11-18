import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import {afterEach, describe, expect, it} from "vitest"
import configModule from "../../src/main/config/ConfigStore.cjs"
import secretModule from "../../src/main/config/SecretStore.cjs"
import {cloudSatInstance, advancedInstance} from "./helpers.js"

const {ConfigStore} = configModule
const {SecretStore} = secretModule
const directories = []
const temporaryDirectory = async () => {
	const directory = await fs.mkdtemp(path.join(os.tmpdir(), "cloudsat-test-"))
	directories.push(directory)
	return directory
}

afterEach(async () => Promise.all(directories.splice(0).map(directory => fs.rm(directory, {recursive: true, force: true}))))

describe("ConfigStore", () => {
	it.each(["tcp-tcp", "tcp-serial"])("clears unused TLS profiles when creating or updating %s", async kind => {
		const filePath = path.join(await temporaryDirectory(), "config.json"), store = new ConfigStore(filePath)
		await store.load()
		const instance = advancedInstance({kind, tlsProfileId: "00000000-0000-4000-8000-000000000009", serial: {enabled: true, path: "/dev/tty.test", baudRate: 9600, connectionMode: "serial_bridge"}})
		expect((await store.createInstance(instance)).tlsProfileId).toBe(null)
		expect((await store.updateInstance(instance.id, instance)).tlsProfileId).toBe(null)
		expect(JSON.parse(await fs.readFile(filePath, "utf8")).instances[0].tlsProfileId).toBe(null)
	})
	it("loads legacy TCP certificate references without retaining unused dependencies", async () => {
		const filePath = path.join(await temporaryDirectory(), "config.json")
		const unused = "00000000-0000-4000-8000-000000000009", used = "00000000-0000-4000-8000-000000000008"
		const instances = [advancedInstance({tlsProfileId: unused}), advancedInstance({id: "00000000-0000-4000-8000-000000000004", kind: "websocket-tcp", tlsProfileId: used}), cloudSatInstance({tlsProfileId: used})]
		const profiles = [unused, used].map(id => ({id, name: "Test certificate", certificatePem: "test-only", privateKeyRef: "00000000-0000-4000-8000-000000000002"}))
		await fs.writeFile(filePath, JSON.stringify({...configModule.DEFAULT_CONFIG, instances, tlsProfiles: profiles}))
		const store = new ConfigStore(filePath); await store.load()
		expect(store.getInstances().map(instance => instance.tlsProfileId)).toEqual([null, used, used])
		await expect(store.removeTlsProfile(unused)).resolves.toMatchObject({id: unused})
		await expect(store.removeTlsProfile(used)).rejects.toMatchObject({code: "TLS_PROFILE_IN_USE"})
	})
	it("creates a versioned default config and persists instances atomically", async () => {
		const directory = await temporaryDirectory()
		const filePath = path.join(directory, "config.json")
		const store = new ConfigStore(filePath)
		expect(await store.load()).toMatchObject({schemaVersion: 1, instances: []})
		await store.createInstance(cloudSatInstance())
		const reloaded = new ConfigStore(filePath)
		await reloaded.load()
		expect(reloaded.getInstances()).toHaveLength(1)
		expect((await fs.readdir(directory)).some(name => name.endsWith(".tmp"))).toBe(false)
	})

	it("rejects duplicate Cloud Sat device IDs", async () => {
		const store = new ConfigStore(path.join(await temporaryDirectory(), "config.json"))
		await store.load()
		await store.createInstance(cloudSatInstance())
		await expect(store.createInstance(cloudSatInstance({id: "00000000-0000-4000-8000-000000000006", listenPort: 8001}))).rejects.toMatchObject({code: "DEVICE_ID_CONFLICT"})
	})
})

describe("SecretStore", () => {
	it("encrypts stored values and can replace and remove them", async () => {
		const safeStorage = {
			isEncryptionAvailable: () => true,
			encryptString: value => Buffer.from(`encrypted:${value}`),
			decryptString: value => value.toString().replace(/^encrypted:/, "")
		}
		const filePath = path.join(await temporaryDirectory(), "secrets.json")
		const store = new SecretStore({filePath, safeStorage})
		await store.load()
		const reference = await store.set("first")
		expect(store.get(reference)).toBe("first")
		await store.set("second", reference)
		expect(store.get(reference)).toBe("second")
		expect(await fs.readFile(filePath, "utf8")).not.toContain("second")
		await store.remove(reference)
		expect(() => store.get(reference)).toThrowError(expect.objectContaining({code: "SECRET_NOT_FOUND"}))
	})

	it("fails closed when secure storage is unavailable", async () => {
		const store = new SecretStore({filePath: path.join(await temporaryDirectory(), "secrets.json"), safeStorage: {isEncryptionAvailable: () => false}})
		await expect(store.set("secret")).rejects.toMatchObject({code: "SECURE_STORAGE_UNAVAILABLE"})
	})
})
