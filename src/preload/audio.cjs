const {contextBridge, ipcRenderer} = require("electron")

// DOM MessagePorts must be transferred into the page, not proxied through contextBridge.
ipcRenderer.on("audio-host:open-session", (event, payload) => {
	window.postMessage({type: "cloudsat-audio-session", payload}, "*", event.ports)
})
contextBridge.exposeInMainWorld("audioHost", Object.freeze({
	onRequest(callback) {
		ipcRenderer.on("audio-host:request", (_event, request) => callback(request))
	},
	respond(response) {
		ipcRenderer.send("audio-host:response", response)
	}
}))
