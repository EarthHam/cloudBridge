const {z} = require("zod")
const {canonicalOrigin} = require("./origins.cjs")
const {BIND_HOSTS, INSTANCE_KINDS, SERIAL_CONNECTION_MODES, DEFAULT_ALLOWED_ORIGINS} = require("./constants.cjs")

const serialTargetSchema = z.object({
	enabled: z.boolean().default(false),
	path: z.string().max(512).default(""),
	baudRate: z.coerce.number().int().min(1).max(4_000_000).default(2400),
	connectionMode: z.enum(SERIAL_CONNECTION_MODES).default("serial_bridge")
}).superRefine((value, context) => {
	if (value.enabled && !value.path.trim()) {
		context.addIssue({code: "custom", path: ["path"], message: "Enabled serial bridge requires a port"})
	}
})

const baseInstanceShape = {
	id: z.string().uuid(),
	name: z.string().trim().min(1).max(80),
	autoStart: z.boolean().default(false),
	bindHost: z.enum(BIND_HOSTS),
	listenPort: z.coerce.number().int().min(1).max(65535),
	tlsProfileId: z.string().uuid().nullable().default(null)
}

const cloudSatInstanceSchema = z.object({
	...baseInstanceShape,
	kind: z.literal("cloudsat"),
	deviceId: z.string().trim().min(1).max(128),
	secretRef: z.string().uuid(),
	authenticationRequired: z.boolean().default(true),
	audio: z.object({
		enabled: z.boolean().default(true),
		inputDeviceId: z.string().default(""),
		outputDeviceId: z.string().default("")
	}).superRefine((value, context) => {
		if (value.enabled && !value.inputDeviceId) context.addIssue({code: "custom", path: ["inputDeviceId"], message: "Audio input is required"})
		if (value.enabled && !value.outputDeviceId) context.addIssue({code: "custom", path: ["outputDeviceId"], message: "Audio output is required"})
	}),
	serialBridges: z.object({
		radio: serialTargetSchema.nullable().default(null),
		ptz: serialTargetSchema.nullable().default(null),
		sdr: serialTargetSchema.nullable().default(null)
	})
})

const advancedInstanceSchema = z.object({
	...baseInstanceShape,
	kind: z.enum(INSTANCE_KINDS.filter(kind => kind !== "cloudsat")),
	allowedOrigins: z.array(z.string().max(2048).refine(value => Boolean(canonicalOrigin(value)), "Expected an exact HTTP, HTTPS or app://cloudsat origin")).max(64).default([...DEFAULT_ALLOWED_ORIGINS]),
	serial: serialTargetSchema.nullable().default(null),
	remoteHost: z.string().trim().max(253).default(""),
	remotePort: z.coerce.number().int().min(1).max(65535).nullable().default(null)
}).superRefine((value, context) => {
	if (value.kind.endsWith("serial") && (!value.serial || !value.serial.enabled)) {
		context.addIssue({code: "custom", path: ["serial"], message: "Serial target is required"})
	}
	if (value.kind.endsWith("tcp") && (!value.remoteHost || !value.remotePort)) {
		context.addIssue({code: "custom", path: ["remoteHost"], message: "Remote TCP target is required"})
	}
})

const instanceSchema = z.discriminatedUnion("kind", [cloudSatInstanceSchema, advancedInstanceSchema])

const settingsSchema = z.object({
	locale: z.enum(["zh-CN", "en"]).default("zh-CN"),
	launchAtLogin: z.boolean().default(false),
	closeToTray: z.boolean().default(true),
	onboardingComplete: z.boolean().default(false)
})

const tlsProfileSchema = z.object({
	id: z.string().uuid(),
	name: z.string().trim().min(1).max(80),
	certificatePem: z.string().min(1),
	privateKeyRef: z.string().uuid(),
	expiresAt: z.string().nullable().default(null)
})

const applicationConfigSchema = z.object({
	schemaVersion: z.literal(1),
	instances: z.array(instanceSchema).default([]),
	tlsProfiles: z.array(tlsProfileSchema).default([]),
	settings: settingsSchema.default({})
})

module.exports = {
	serialTargetSchema,
	cloudSatInstanceSchema,
	advancedInstanceSchema,
	instanceSchema,
	settingsSchema,
	tlsProfileSchema,
	applicationConfigSchema
}
