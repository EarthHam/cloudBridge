const os = require("node:os")
const net = require("node:net")
const {randomBytes, randomUUID} = require("node:crypto")
const {isLanAddress} = require("../security/lanAccess.cjs")
const {INSTANCE_STATUS, DEFAULT_ALLOWED_ORIGINS} = require("../../shared/constants.cjs")
const {AppError, serializeError} = require("../errors/AppError.cjs")
const {CloudSatRuntime} = require("./CloudSatRuntime.cjs")
const {AdvancedRuntime} = require("./AdvancedRuntime.cjs")

const localAddresses = family => Object.values(os.networkInterfaces()).flat().filter(Boolean)
	.filter(item => item.family === family && !item.internal)
	.map(item => item.address)
	.filter(address => family !== "IPv6" || !address.toLowerCase().startsWith("fe8") && !address.toLowerCase().startsWith("fe9") && !address.toLowerCase().startsWith("fea") && !address.toLowerCase().startsWith("feb"))
	.filter((address, index, addresses) => addresses.indexOf(address) === index)
	.sort()

const endpointProtocol = instance => {
	if (instance.kind.startsWith("tcp-")) return "tcp"
	return instance.tlsProfileId ? "wss" : "ws"
}

const endpointHosts = instance => {
	if (instance.bindHost === "0.0.0.0") {
		const addresses = localAddresses("IPv4")
		return addresses.length ? addresses : ["127.0.0.1"]
	}
	if (instance.bindHost === "::") {
		const ipv4 = localAddresses("IPv4")
		const ipv6 = localAddresses("IPv6")
		return [...(ipv4.length ? ipv4 : ["127.0.0.1"]), ...(ipv6.length ? ipv6 : ["::1"])]
	}
	return [instance.bindHost]
}

const formatEndpointHost = host => net.isIP(host) === 6 ? `[${host}]` : host

class InstanceManager {
	constructor({configStore, secretStore, resourceRegistry, audioHost, log, onStatus, runtimeFactory = null}) {
		this.configStore = configStore
		this.secretStore = secretStore
		this.resourceRegistry = resourceRegistry
		this.audioHost = audioHost
		this.log = log
		this.onStatus = onStatus
		this.runtimes = new Map()
		this.statuses = new Map()
		this.operations = new Map()
		this.runtimeFactory = runtimeFactory || (options => options.instance.kind === "cloudsat"
			? new CloudSatRuntime({...options, secret: this.secretStore.get(options.instance.secretRef), audioHost: this.audioHost})
			: new AdvancedRuntime(options))
	}

	list() { return this.configStore.getInstances().map(instance => this.view(instance)) }
	get(id) {
		const instance = this.configStore.getInstance(id)
		if (!instance) throw new AppError("INSTANCE_NOT_FOUND", "Instance was not found")
		return this.view(instance)
	}
	view(instance) {
		const status = this.statuses.get(instance.id) || {status: INSTANCE_STATUS.STOPPED, error: null}
		const protocol = endpointProtocol(instance)
		const runtime = this.runtimes.get(instance.id)
		const endpointInstance = runtime?.effectiveBindHost && runtime.effectiveBindHost !== instance.bindHost ? {...instance, bindHost: runtime.effectiveBindHost} : instance
		const hosts = endpointHosts(endpointInstance).filter(host => isLanAddress(host))
		if (!hosts.length) hosts.push(...(endpointInstance.bindHost === "::" ? ["127.0.0.1", "::1"] : ["127.0.0.1"]))
		return {...instance, status: status.status, error: status.error, health: runtime?.health?.() || null, endpoints: hosts.map(host => `${protocol}://${formatEndpointHost(host)}:${instance.listenPort}`)}
	}

	defaults(kind) {
		const usedPorts = new Set(this.configStore.getInstances().map(item => item.listenPort))
		let listenPort = kind === "cloudsat" ? 8000 : 17080
		while (usedPorts.has(listenPort)) listenPort++
		const base = {id: randomUUID(), name: "", kind, autoStart: false, bindHost: "0.0.0.0", listenPort, tlsProfileId: null}
		if (kind === "cloudsat") return {...base, deviceId: `station-${randomUUID().slice(0, 8)}`, authenticationRequired: true, audio: {enabled: false, inputDeviceId: "", outputDeviceId: ""}, serialBridges: {radio: null, ptz: null, sdr: null}, deviceSecret: randomBytes(32).toString("base64url")}
		return {...base, allowedOrigins: [...DEFAULT_ALLOWED_ORIGINS], serial: kind.endsWith("serial") ? {enabled: true, path: "", baudRate: 2400, connectionMode: "serial_bridge"} : null, remoteHost: kind.endsWith("tcp") ? "127.0.0.1" : "", remotePort: kind.endsWith("tcp") ? 9000 : null}
	}

	async create(candidate) {
		const data = structuredClone(candidate)
		let generatedSecret = null
		if (data.kind === "cloudsat") {
			generatedSecret = data.deviceSecret || randomBytes(32).toString("base64url")
			delete data.deviceSecret
			data.secretRef = await this.secretStore.set(generatedSecret)
		}
		try {
			const instance = await this.configStore.createInstance(data)
			this.emit(instance.id)
			return {...this.view(instance), generatedSecret}
		} catch (error) {
			if (data.secretRef) await this.secretStore.remove(data.secretRef)
			throw error
		}
	}

	async update(id, candidate) {
		const previous = this.configStore.getInstance(id)
		if (!previous) throw new AppError("INSTANCE_NOT_FOUND", "Instance was not found")
		const wasRunning = this.runtimes.has(id)
		if (wasRunning) await this.stop(id)
		const data = structuredClone(candidate)
		if (previous.kind === "cloudsat") {
			data.secretRef = previous.secretRef
			if (data.deviceSecret) await this.secretStore.set(data.deviceSecret, previous.secretRef)
			delete data.deviceSecret
		}
		try {
			const updated = await this.configStore.updateInstance(id, data)
			if (wasRunning) await this.start(id)
			this.emit(id)
			return this.view(updated)
		} catch (error) {
			if (wasRunning && !this.runtimes.has(id)) {
				try { await this.start(id) } catch (restartError) { this.log.error(id, "Unable to restore instance after failed update", {message: restartError.message}) }
			}
			throw error
		}
	}

	async duplicate(id) {
		const original = this.configStore.getInstance(id)
		if (!original) throw new AppError("INSTANCE_NOT_FOUND", "Instance was not found")
		const draft = {...structuredClone(original), ...this.defaults(original.kind), name: `${original.name} Copy`, autoStart: false}
		if (original.kind !== "cloudsat") draft.allowedOrigins = [...(original.allowedOrigins || DEFAULT_ALLOWED_ORIGINS)]
		if (original.kind === "cloudsat") {
			draft.audio = {...original.audio, inputDeviceId: "", outputDeviceId: "", enabled: false}
			draft.serialBridges = Object.fromEntries(Object.entries(original.serialBridges).map(([name, value]) => [name, value ? {...value, path: "", enabled: false} : null]))
		}
		return draft
	}

	revealSecret(id) {
		const instance = this.configStore.getInstance(id)
		if (!instance || instance.kind !== "cloudsat") throw new AppError("INSTANCE_NOT_FOUND", "Cloud Sat instance was not found")
		return this.secretStore.get(instance.secretRef)
	}

	resolveTls(instance) {
		if (instance.kind.startsWith("tcp-") || !instance.tlsProfileId) return null
		const profile = this.configStore.getTlsProfile(instance.tlsProfileId)
		if (!profile) throw new AppError("TLS_PROFILE_NOT_FOUND", "TLS profile was not found")
		return {certificatePem: profile.certificatePem, privateKeyPem: this.secretStore.get(profile.privateKeyRef)}
	}

	setStatus(id, status, error = null) {
		this.statuses.set(id, {status, error: error ? serializeError(error) : null})
		this.emit(id)
	}
	emit(id) {
		if (!this.onStatus) return
		try { this.onStatus(this.get(id)) } catch (error) { this.log.warn(id, "Unable to publish instance status", {message: error.message}) }
	}

	queue(id, operation) {
		const previous = this.operations.get(id) || Promise.resolve()
		const current = previous.catch(() => {}).then(operation)
		this.operations.set(id, current)
		return current.finally(() => {
			if (this.operations.get(id) === current) this.operations.delete(id)
		})
	}

	start(id) { return this.queue(id, () => this.startNow(id)) }
	async startNow(id) {
		if (this.runtimes.has(id)) return this.get(id)
		const instance = this.configStore.getInstance(id)
		if (!instance) throw new AppError("INSTANCE_NOT_FOUND", "Instance was not found")
		this.setStatus(id, INSTANCE_STATUS.STARTING)
		try {
			this.resourceRegistry.acquire(instance)
			const options = {instance, tls: this.resolveTls(instance), log: this.log}
			const runtime = this.runtimeFactory(options)
			try { await runtime.start() } catch (error) {
				try { await runtime.stop() } catch (cleanupError) { this.log.warn(id, "Failed to clean up a partially started instance", {message: cleanupError.message}) }
				throw error
			}
			this.runtimes.set(id, runtime)
			this.setStatus(id, INSTANCE_STATUS.RUNNING)
			return this.get(id)
		} catch (error) {
			this.resourceRegistry.release(id)
			this.setStatus(id, INSTANCE_STATUS.ERROR, error)
			throw error
		}
	}

	stop(id) { return this.queue(id, () => this.stopNow(id)) }
	async stopNow(id) {
		const runtime = this.runtimes.get(id)
		if (!runtime) { this.setStatus(id, INSTANCE_STATUS.STOPPED); return this.get(id) }
		this.setStatus(id, INSTANCE_STATUS.STOPPING)
		try { await runtime.stop() } finally {
			this.runtimes.delete(id)
			this.resourceRegistry.release(id)
			this.setStatus(id, INSTANCE_STATUS.STOPPED)
		}
		return this.get(id)
	}

	restart(id) { return this.queue(id, async () => { await this.stopNow(id); return this.startNow(id) }) }
	async startAll({autoOnly = false} = {}) {
		const instances = this.configStore.getInstances().filter(item => !autoOnly || item.autoStart)
		return Promise.all(instances.map(async instance => { try { return {id: instance.id, ok: true, value: await this.start(instance.id)} } catch (error) { return {id: instance.id, ok: false, error: serializeError(error)} } }))
	}
	async stopAll() {
		const ids = new Set([...this.runtimes.keys(), ...this.operations.keys()])
		return Promise.all([...ids].map(async id => { try { return {id, ok: true, value: await this.stop(id)} } catch (error) { return {id, ok: false, error: serializeError(error)} } }))
	}
	async remove(id) {
		if (this.runtimes.has(id)) await this.stop(id)
		const removed = await this.configStore.removeInstance(id)
		if (removed.kind === "cloudsat") await this.secretStore.remove(removed.secretRef)
		this.statuses.delete(id)
		return {status: true}
	}
}

module.exports = {InstanceManager, localAddresses, endpointHosts, endpointProtocol, formatEndpointHost}
