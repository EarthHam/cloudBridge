const INSTANCE_KINDS = Object.freeze([
	"cloudsat",
	"websocket-serial",
	"websocket-tcp",
	"tcp-serial",
	"tcp-tcp"
])

const BIND_HOSTS = Object.freeze(["::", "0.0.0.0", "::1", "127.0.0.1"])

const INSTANCE_STATUS = Object.freeze({
	STOPPED: "stopped",
	STARTING: "starting",
	RUNNING: "running",
	DEGRADED: "degraded",
	STOPPING: "stopping",
	ERROR: "error"
})

const SERIAL_CONNECTION_MODES = Object.freeze([
	"serial_bridge",
	"native_usb_cdc",
	"no_control_lines"
])

const CLOUDSAT_PATHS = Object.freeze({
	MEDIA: "/media",
	RADIO: "/serial/radio",
	PTZ: "/serial/ptz",
	SDR: "/serial/sdr"
})

const PROTOCOL_VERSION = 2
const AUDIO_FRAME_VERSION = 1
const AUDIO_FRAME_HEADER_BYTES = 8
const AUDIO_FRAME_MAGIC = Buffer.from("AB", "ascii")
const MAX_FRAME_BYTES = 64 * 1024
const MAX_PENDING_BYTES = 1024 * 1024
const MAX_PENDING_ITEMS = 256
const MAX_CONNECTIONS = 64
const DEFAULT_ALLOWED_ORIGINS = Object.freeze([
	"https://ptz.cloudsat.cn", "https://m.cloudsat.cn", "https://mapp.cloudsat.cn", "app://cloudsat"
])

module.exports = {
	INSTANCE_KINDS,
	BIND_HOSTS,
	INSTANCE_STATUS,
	SERIAL_CONNECTION_MODES,
	CLOUDSAT_PATHS,
	PROTOCOL_VERSION,
	AUDIO_FRAME_VERSION,
	AUDIO_FRAME_HEADER_BYTES,
	AUDIO_FRAME_MAGIC,
	MAX_FRAME_BYTES,
	MAX_PENDING_BYTES,
	MAX_PENDING_ITEMS,
	MAX_CONNECTIONS,
	DEFAULT_ALLOWED_ORIGINS
}
