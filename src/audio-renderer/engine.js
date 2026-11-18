const sessions = new Map()

const enumerateDevices = async () => {
	const devices = await navigator.mediaDevices.enumerateDevices()
	return devices.filter(item => item.kind === "audioinput" || item.kind === "audiooutput").map(item => ({deviceId: item.deviceId, groupId: item.groupId, kind: item.kind, label: item.label || (item.kind === "audioinput" ? "Audio input" : "Audio output")}))
}

const dispose = async session => {
	session.stream?.getTracks().forEach(track => track.stop())
	if (session.context && !session.contextClosing) session.contextClosing = session.context.close()
	await session.contextClosing
}
const assertActive = session => { if (session.cancelled) throw new Error("Audio session was cancelled") }

const openSession = (payload, port) => {
	if (sessions.has(payload.instanceId)) { port.postMessage({type: "error", message: "Audio session is already active"}); port.close(); return }
	const session = {cancelled: false, stream: null, context: null, capture: null, playback: null, closing: null}
	sessions.set(payload.instanceId, session)
	const close = () => {
		if (session.closing) return session.closing
		session.cancelled = true
		session.closing = (async () => {
			await dispose(session)
			await session.opening
			await dispose(session)
			if (sessions.get(payload.instanceId) === session) sessions.delete(payload.instanceId)
			port.postMessage({type: "closed"})
			port.close()
		})()
		return session.closing
	}
	port.onmessage = event => {
		const message = event.data || {}
		if (message.type === "close") { close(); return }
		if (session.cancelled) return
		if (message.type === "play" && session.playback) session.playback.port.postMessage(message, [message.data])
		else if (message.type === "capture-ack") session.capture?.port.postMessage(message)
	}
	port.start()
	session.opening = (async () => {
		try {
			session.stream = await navigator.mediaDevices.getUserMedia({audio: {deviceId: {exact: payload.inputDeviceId}, channelCount: {exact: 1}, sampleRate: {ideal: 48000}, echoCancellation: false, noiseSuppression: false, autoGainControl: false}, video: false})
			assertActive(session)
			const context = session.context = new AudioContext({sampleRate: 48000, latencyHint: "interactive"})
			if (payload.outputDeviceId && typeof context.setSinkId === "function") await context.setSinkId(payload.outputDeviceId)
			assertActive(session)
			await Promise.all([context.audioWorklet.addModule(new URL("./capture.worklet.js", window.location.href).href), context.audioWorklet.addModule(new URL("./playback.worklet.js", window.location.href).href)])
			assertActive(session)
			const source = context.createMediaStreamSource(session.stream)
			const capture = session.capture = new AudioWorkletNode(context, "cloudsat-capture", {processorOptions: payload.limits})
			const playback = session.playback = new AudioWorkletNode(context, "cloudsat-playback", {outputChannelCount: [1], processorOptions: payload.limits})
			const silent = context.createGain()
			silent.gain.value = 0
			source.connect(capture).connect(silent).connect(context.destination)
			playback.connect(context.destination)
			capture.port.onmessage = event => {
				if (session.cancelled) return
				if (event.data.type === "capture") port.postMessage(event.data, [event.data.data])
				else { port.postMessage(event.data); if (event.data.type === "error") close() }
			}
			playback.port.onmessage = event => { if (!session.cancelled) port.postMessage(event.data) }
			await context.resume()
			assertActive(session)
			port.postMessage({type: "ready"})
		} catch (error) {
			await dispose(session)
			if (!session.cancelled) { port.postMessage({type: "error", message: error.message || String(error)}); queueMicrotask(close) }
		}
	})()
}

window.addEventListener("message", event => {
	if (event.source !== window || event.data?.type !== "cloudsat-audio-session" || event.ports.length !== 1) return
	openSession(event.data.payload, event.ports[0])
})
window.audioHost.onRequest(async request => {
	try {
		if (request.type === "list-devices") { window.audioHost.respond({id: request.id, result: await enumerateDevices()}); return }
		if (request.type === "test-devices") {
			const stream = await navigator.mediaDevices.getUserMedia({audio: {deviceId: {exact: request.payload.inputDeviceId}}, video: false})
			let context
			try {
				context = new AudioContext({sampleRate: 48000})
				if (request.payload.outputDeviceId && typeof context.setSinkId === "function") await context.setSinkId(request.payload.outputDeviceId)
			} finally { stream.getTracks().forEach(track => track.stop()); if (context) await context.close() }
			window.audioHost.respond({id: request.id, result: {status: true}})
			return
		}
		throw new Error("Unsupported audio-host request")
	} catch (error) { window.audioHost.respond({id: request.id, error: error.message || String(error)}) }
})
