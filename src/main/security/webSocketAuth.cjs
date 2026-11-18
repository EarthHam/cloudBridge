const crypto = require("node:crypto")
const {PROTOCOL_VERSION} = require("../../shared/constants.cjs")
const {AppError} = require("../errors/AppError.cjs")
const {parseAddress} = require("./lanAccess.cjs")

const secureEqual = (left, right) => {
	if (typeof left !== "string" || typeof right !== "string") return false
	const leftBuffer = Buffer.from(left)
	const rightBuffer = Buffer.from(right)
	return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer)
}

const receiveFirstMessage = (webSocket, timeoutMs = 10_000, signal) => new Promise((resolve, reject) => {
	let finished = false
	const finish = (error, value) => {
		if (finished) return
		finished = true
		clearTimeout(timer)
		webSocket.off("message", onMessage)
		webSocket.off("close", onClose)
		webSocket.off("error", onError)
		signal?.removeEventListener("abort", onAbort)
		error ? reject(error) : resolve(value)
	}
	const onMessage = (data, isBinary) => finish(null, {data, isBinary})
	const onClose = () => finish(new AppError("AUTH_FAILED", "Connection closed before authentication"))
	const onError = error => finish(error)
	const onAbort = () => finish(new AppError("SESSION_CANCELLED", "Instance stopped"))
	const timer = setTimeout(() => finish(new AppError("AUTH_FAILED", "Authentication timed out")), timeoutMs)
	webSocket.once("message", onMessage)
	webSocket.once("close", onClose)
	webSocket.once("error", onError)
	signal?.addEventListener("abort", onAbort, {once: true})
	if (signal?.aborted) onAbort()
	else if (webSocket.readyState !== undefined && webSocket.readyState !== 1) onClose()
})

const authenticateWebSocket = async ({webSocket, instance, secret, limiter, source, signal, stopSignal = signal}) => {
	if (signal?.aborted) throw new AppError("SESSION_CANCELLED", "Instance stopped")
	const address = parseAddress(source)
	const normalized = address ? `${address.family}:${address.value}` : source
	const release = limiter.reserve(normalized)
	let failed = true
	try {
		const packet = await receiveFirstMessage(webSocket, 10_000, signal)
		if (signal?.aborted) throw new AppError("SESSION_CANCELLED", "Instance stopped")
		if (packet.isBinary) throw new AppError("AUTH_FAILED", "The first frame must be an authentication message")
		let message
		try { message = JSON.parse(Buffer.from(packet.data).toString("utf8")) } catch { throw new AppError("AUTH_FAILED", "Authentication message is not valid JSON") }
		const valid = message && message.version === PROTOCOL_VERSION && message.type === "authenticate" && message.role === "controller" && message.deviceId === instance.deviceId && secureEqual(message.secret, secret)
		if (!valid) throw new AppError("AUTH_FAILED", "Device ID or secret is invalid")
		failed = false
		return message
	} finally { release({failed: failed && !stopSignal?.aborted}) }
}

module.exports = {authenticateWebSocket, receiveFirstMessage, secureEqual}
