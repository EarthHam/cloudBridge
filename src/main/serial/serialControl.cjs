const {AppError} = require("../errors/AppError.cjs")

const CONTROL_COMMANDS = Object.freeze({
	dtr0: {name: "dtr", value: false},
	dtr1: {name: "dtr", value: true},
	rts0: {name: "rts", value: false},
	rts1: {name: "rts", value: true}
})

const setControlLine = (port, name, value) => new Promise((resolve, reject) => {
	port.set({[name]: value}, error => error ? reject(error) : resolve())
})

const initializeControlLines = async (port, mode) => {
	if (mode === "no_control_lines") return
	if (mode === "native_usb_cdc") {
		await setControlLine(port, "rts", true)
		await setControlLine(port, "dtr", true)
		return
	}
	await setControlLine(port, "dtr", false)
	await setControlLine(port, "rts", false)
}

const releaseControlLines = async (port, mode) => {
	if (mode === "no_control_lines") return
	await setControlLine(port, "dtr", false)
	await setControlLine(port, "rts", false)
}

const applyControlCommand = async (port, data, mode) => {
	const command = Buffer.from(data).toString("utf8")
	const operation = CONTROL_COMMANDS[command]
	if (!operation) return false
	if (mode !== "no_control_lines") await setControlLine(port, operation.name, operation.value)
	return true
}

const assertControlMode = mode => {
	if (!["serial_bridge", "native_usb_cdc", "no_control_lines"].includes(mode)) {
		throw new AppError("INVALID_SERIAL_MODE", "Unsupported serial control-line mode")
	}
}

module.exports = {initializeControlLines, releaseControlLines, applyControlCommand, assertControlMode}
