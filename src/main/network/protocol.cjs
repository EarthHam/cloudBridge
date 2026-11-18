const {AUDIO_FRAME_HEADER_BYTES, AUDIO_FRAME_MAGIC, AUDIO_FRAME_VERSION, MAX_FRAME_BYTES, PROTOCOL_VERSION} = require("../../shared/constants.cjs")
const {AppError} = require("../errors/AppError.cjs")
const baseMessage = (type, deviceId, sessionId = "", extra = {}) => ({version: PROTOCOL_VERSION, type, deviceId, sessionId, ...extra})
const encodeAudioFrame = (sequence, pcm) => {
	const payload = Buffer.from(pcm)
	if (payload.length + AUDIO_FRAME_HEADER_BYTES > MAX_FRAME_BYTES) throw new AppError("FRAME_TOO_LARGE", "Audio frame is too large")
	if (payload.length % 2 !== 0) throw new AppError("PROTOCOL_MISMATCH", "PCM16 audio payload must contain complete samples")
	const frame = Buffer.allocUnsafe(AUDIO_FRAME_HEADER_BYTES + payload.length)
	AUDIO_FRAME_MAGIC.copy(frame, 0); frame[2] = AUDIO_FRAME_VERSION; frame[3] = 1; frame.writeUInt32BE(sequence >>> 0, 4); payload.copy(frame, AUDIO_FRAME_HEADER_BYTES)
	return frame
}
const decodeAudioFrame = frame => {
	const data = Buffer.from(frame)
	if (data.length < AUDIO_FRAME_HEADER_BYTES) throw new AppError("PROTOCOL_MISMATCH", "Audio frame is too short")
	if (data.length > MAX_FRAME_BYTES) throw new AppError("FRAME_TOO_LARGE", "Audio frame is too large")
	if (!data.subarray(0, 2).equals(AUDIO_FRAME_MAGIC)) throw new AppError("PROTOCOL_MISMATCH", "Invalid audio frame magic")
	if (data[2] !== AUDIO_FRAME_VERSION || data[3] !== 1) throw new AppError("PROTOCOL_MISMATCH", "Unsupported audio frame format")
	const pcm = data.subarray(AUDIO_FRAME_HEADER_BYTES)
	if (pcm.length % 2 !== 0) throw new AppError("PROTOCOL_MISMATCH", "PCM16 audio payload must contain complete samples")
	return {sequence: data.readUInt32BE(4), pcm}
}
module.exports = {baseMessage, encodeAudioFrame, decodeAudioFrame}
