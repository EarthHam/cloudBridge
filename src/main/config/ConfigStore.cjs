const fs = require("node:fs/promises")
const path = require("node:path")
const {randomUUID} = require("node:crypto")
const {applicationConfigSchema, instanceSchema, settingsSchema, tlsProfileSchema} = require("../../shared/schemas.cjs")
const {AppError} = require("../errors/AppError.cjs")

const DEFAULT_CONFIG = Object.freeze({
	schemaVersion: 1,
	instances: [],
	tlsProfiles: [],
	settings: {locale: "zh-CN", launchAtLogin: false, closeToTray: true, onboardingComplete: false}
})

const normalizeTlsProfile = instance => {
	if (instance.kind.startsWith("tcp-")) instance.tlsProfileId = null
	return instance
}

class ConfigStore {
	constructor(filePath) {
		this.filePath = filePath
		this.config = structuredClone(DEFAULT_CONFIG)
		this.writeQueue = Promise.resolve()
	}

	async load() {
		try {
			this.config = applicationConfigSchema.parse(JSON.parse(await fs.readFile(this.filePath, "utf8")))
			this.config.instances = this.config.instances.map(normalizeTlsProfile)
		} catch (error) {
			if (error.code === "ENOENT") {
				this.config = structuredClone(DEFAULT_CONFIG)
				await this.persist()
				return this.getConfig()
			}
			if (error instanceof SyntaxError || error.name === "ZodError") {
				throw new AppError("CONFIG_INVALID", "Application configuration is invalid", error.issues || error.message)
			}
			throw error
		}
		return this.getConfig()
	}

	getConfig() { return structuredClone(this.config) }
	getInstances() { return structuredClone(this.config.instances) }
	getInstance(id) {
		const instance = this.config.instances.find(item => item.id === id)
		return instance ? structuredClone(instance) : null
	}

	async createInstance(candidate) {
		const instance = normalizeTlsProfile(instanceSchema.parse(candidate))
		if (this.config.instances.some(item => item.id === instance.id)) throw new AppError("INSTANCE_EXISTS", "An instance with this ID already exists")
		this.assertUniqueIdentity(instance)
		this.config.instances.push(instance)
		await this.persist()
		return structuredClone(instance)
	}

	async updateInstance(id, candidate) {
		const index = this.config.instances.findIndex(item => item.id === id)
		if (index < 0) throw new AppError("INSTANCE_NOT_FOUND", "Instance was not found")
		const instance = normalizeTlsProfile(instanceSchema.parse({...candidate, id}))
		this.assertUniqueIdentity(instance, id)
		this.config.instances[index] = instance
		await this.persist()
		return structuredClone(instance)
	}

	async removeInstance(id) {
		const index = this.config.instances.findIndex(item => item.id === id)
		if (index < 0) throw new AppError("INSTANCE_NOT_FOUND", "Instance was not found")
		const [removed] = this.config.instances.splice(index, 1)
		await this.persist()
		return removed
	}

	assertUniqueIdentity(instance, ignoredId = null) {
		if (instance.kind !== "cloudsat") return
		if (this.config.instances.some(item => item.id !== ignoredId && item.kind === "cloudsat" && item.deviceId === instance.deviceId)) {
			throw new AppError("DEVICE_ID_CONFLICT", "Cloud Sat device ID must be unique")
		}
	}

	getSettings() { return structuredClone(this.config.settings) }
	async updateSettings(patch) {
		this.config.settings = settingsSchema.parse({...this.config.settings, ...patch})
		await this.persist()
		return this.getSettings()
	}
	getTlsProfiles() { return structuredClone(this.config.tlsProfiles) }
	getTlsProfile(id) {
		const profile = this.config.tlsProfiles.find(item => item.id === id)
		return profile ? structuredClone(profile) : null
	}
	async addTlsProfile(candidate) {
		const profile = tlsProfileSchema.parse(candidate)
		this.config.tlsProfiles.push(profile)
		await this.persist()
		return structuredClone(profile)
	}
	async removeTlsProfile(id) {
		if (this.config.instances.some(instance => instance.tlsProfileId === id)) throw new AppError("TLS_PROFILE_IN_USE", "TLS profile is used by an instance")
		const index = this.config.tlsProfiles.findIndex(item => item.id === id)
		if (index < 0) throw new AppError("TLS_PROFILE_NOT_FOUND", "TLS profile was not found")
		const [removed] = this.config.tlsProfiles.splice(index, 1)
		await this.persist()
		return removed
	}

	async persist() {
		const content = JSON.stringify(this.config, null, 2)
		const operation = this.writeQueue.then(async () => {
			await fs.mkdir(path.dirname(this.filePath), {recursive: true})
			const temporaryPath = `${this.filePath}.${randomUUID()}.tmp`
			try {
				await fs.writeFile(temporaryPath, content, {encoding: "utf8", mode: 0o600})
				await fs.rename(temporaryPath, this.filePath)
			} catch (error) {
				await fs.rm(temporaryPath, {force: true}).catch(() => null)
				throw error
			}
		})
		this.writeQueue = operation.catch(() => null)
		return operation
	}
}

module.exports = {ConfigStore, DEFAULT_CONFIG}
