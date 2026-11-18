export const cloudSatInstance = (overrides = {}) => ({
	id: "00000000-0000-4000-8000-000000000001",
	name: "Main station",
	kind: "cloudsat",
	autoStart: false,
	bindHost: "127.0.0.1",
	listenPort: 8000,
	tlsProfileId: null,
	deviceId: "station-main",
	secretRef: "00000000-0000-4000-8000-000000000002",
	authenticationRequired: true,
	audio: {enabled: false, inputDeviceId: "", outputDeviceId: ""},
	serialBridges: {radio: null, ptz: null, sdr: null},
	...overrides
})

export const advancedInstance = (overrides = {}) => ({
	id: "00000000-0000-4000-8000-000000000003",
	name: "TCP forwarder",
	kind: "tcp-tcp",
	autoStart: false,
	bindHost: "127.0.0.1",
	listenPort: 17080,
	tlsProfileId: null,
	serial: null,
	remoteHost: "127.0.0.1",
	remotePort: 9000,
	...overrides
})
