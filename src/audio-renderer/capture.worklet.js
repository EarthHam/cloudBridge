class CaptureProcessor extends AudioWorkletProcessor {
	constructor({processorOptions}) {
		super()
		this.frame = new Int16Array(960)
		this.limits = processorOptions
		this.offset = 0
		this.pending = new Set()
		this.nextPacket = 0
		this.failed = false
		this.port.onmessage = event => { if (event.data.type === "capture-ack") this.pending.delete(event.data.id) }
	}

	process(inputs) {
		const input = inputs[0] && inputs[0][0]
		if (!input || this.failed) return true
		for (let index = 0; index < input.length; index++) {
			const sample = Math.max(-1, Math.min(1, input[index]))
			this.frame[this.offset++] = sample < 0 ? sample * 0x8000 : sample * 0x7fff
			if (this.offset === this.frame.length) {
				const data = this.frame.buffer
				if (this.pending.size >= this.limits.items || (this.pending.size + 1) * this.frame.byteLength > this.limits.bytes) {
					this.failed = true
					this.port.postMessage({type: "error", message: "Audio capture queue is full"})
					return true
				}
				const id = this.nextPacket++
				this.pending.add(id)
				this.port.postMessage({type: "capture", id, data}, [data])
				this.frame = new Int16Array(960)
				this.offset = 0
			}
		}
		return true
	}
}

registerProcessor("cloudsat-capture", CaptureProcessor)
