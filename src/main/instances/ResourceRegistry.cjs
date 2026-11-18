const {AppError} = require("../errors/AppError.cjs")
const WILDCARD_HOSTS = new Set(["0.0.0.0", "::", "[::]"])
const hostsConflict = (left, right) => left === right || WILDCARD_HOSTS.has(left) || WILDCARD_HOSTS.has(right)
const collectResources = instance => {
	const resources = {listener: {host: instance.bindHost, port: instance.listenPort}, serial: [], audio: []}
	if (instance.kind === "cloudsat") {
		Object.values(instance.serialBridges).filter(Boolean).filter(item => item.enabled).forEach(item => resources.serial.push(item.path))
		if (instance.audio.enabled) {
			resources.audio.push(`input:${instance.audio.inputDeviceId}`)
			resources.audio.push(`output:${instance.audio.outputDeviceId}`)
		}
	} else if (instance.serial && instance.serial.enabled) resources.serial.push(instance.serial.path)
	return resources
}
const duplicateValue = values => values.find((value, index) => values.indexOf(value) !== index)
class ResourceRegistry {
	constructor() { this.leases = new Map() }
	acquire(instance) {
		const requested = collectResources(instance)
		const duplicateSerial = duplicateValue(requested.serial)
		if (duplicateSerial) throw new AppError("SERIAL_CONFLICT", `Serial port ${duplicateSerial} is selected more than once in this instance`, {ownerId: instance.id})
		for (const [ownerId, lease] of this.leases) {
			if (ownerId === instance.id) continue
			if (lease.listener.port === requested.listener.port && hostsConflict(lease.listener.host, requested.listener.host)) throw new AppError("PORT_CONFLICT", `Port ${requested.listener.port} is used by another running instance`, {ownerId})
			const serialConflict = requested.serial.find(item => lease.serial.includes(item))
			if (serialConflict) throw new AppError("SERIAL_CONFLICT", `Serial port ${serialConflict} is used by another running instance`, {ownerId})
			const audioConflict = requested.audio.find(item => lease.audio.includes(item))
			if (audioConflict) throw new AppError("AUDIO_CONFLICT", "Audio device is used by another running instance", {ownerId, resource: audioConflict})
		}
		this.leases.set(instance.id, requested)
		return requested
	}
	release(instanceId) { this.leases.delete(instanceId) }
}
module.exports = {ResourceRegistry, collectResources, hostsConflict, duplicateValue}
