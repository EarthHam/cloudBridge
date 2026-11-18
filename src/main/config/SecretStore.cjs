const fs = require("node:fs/promises")
const path = require("node:path")
const {randomUUID} = require("node:crypto")
const {AppError} = require("../errors/AppError.cjs")

class SecretStore {
	constructor({filePath, safeStorage}) {
		this.filePath = filePath
		this.safeStorage = safeStorage
		this.values = {}
		this.writeQueue = Promise.resolve()
	}

	async load() {
		try {
			this.values = JSON.parse(await fs.readFile(this.filePath, "utf8"))
		} catch (error) {
			if (error.code !== "ENOENT") throw error
			this.values = {}
		}
	}

	assertAvailable() {
		if (!this.safeStorage || !this.safeStorage.isEncryptionAvailable()) {
			throw new AppError("SECURE_STORAGE_UNAVAILABLE", "System secure storage is unavailable")
		}
	}

	async set(value, existingRef = null) {
		this.assertAvailable()
		const reference = existingRef || randomUUID()
		this.values[reference] = this.safeStorage.encryptString(String(value)).toString("base64")
		await this.persist()
		return reference
	}

	get(reference) {
		this.assertAvailable()
		const encoded = this.values[reference]
		if (!encoded) throw new AppError("SECRET_NOT_FOUND", "Stored secret was not found")
		return this.safeStorage.decryptString(Buffer.from(encoded, "base64"))
	}

	async remove(reference) {
		if (!reference || !this.values[reference]) return
		delete this.values[reference]
		await this.persist()
	}

	async persist() {
		const content = JSON.stringify(this.values, null, 2)
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

module.exports = {SecretStore}
