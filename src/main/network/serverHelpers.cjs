const http = require("node:http")
const https = require("node:https")
const {WebSocketServer} = require("ws")
const {AppError} = require("../errors/AppError.cjs")

const createBaseServer = ({tls, requestHandler}) => tls
	? https.createServer({cert: tls.certificatePem, key: tls.privateKeyPem}, requestHandler)
	: http.createServer(requestHandler)

const IPV6_FALLBACK_ERRORS = new Set(["EAFNOSUPPORT", "EADDRNOTAVAIL"])

const listenOnce = (server, options) => new Promise((resolve, reject) => {
	const onError = error => {
		server.off("listening", onListening)
		reject(new AppError(error.code || "LISTEN_FAILED", error.message))
	}
	const onListening = () => {
		server.off("error", onError)
		resolve()
	}
	server.once("error", onError)
	server.once("listening", onListening)
	server.listen(options)
})

const listen = async (server, host, port) => {
	try {
		await listenOnce(server, host === "::" ? {host, port, ipv6Only: false} : {host, port})
		return {host}
	} catch (error) {
		if (host !== "::" || !IPV6_FALLBACK_ERRORS.has(error.code)) throw error
		await listenOnce(server, {host: "0.0.0.0", port})
		return {host: "0.0.0.0"}
	}
}

const closeServer = server => new Promise(resolve => {
	if (!server || !server.listening) return resolve()
	server.close(() => resolve())
	if (typeof server.closeAllConnections === "function") server.closeAllConnections()
})

const createWebSocketServer = () => new WebSocketServer({noServer: true, perMessageDeflate: false, maxPayload: 64 * 1024})

module.exports = {IPV6_FALLBACK_ERRORS, createBaseServer, createWebSocketServer, listen, listenOnce, closeServer}
