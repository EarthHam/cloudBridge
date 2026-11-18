class PlaybackProcessor extends AudioWorkletProcessor {
	constructor({processorOptions}) {
		super()
		this.limits = processorOptions
		this.queue = []
		this.queuedBytes = 0
		this.current = null
		this.offset = 0
		this.started = false
		this.lowWaterEvents = 0
		this.underrunEvents = 0
		this.droppedBytes = 0
		this.port.onmessage = event => {
			if (event.data.type !== "play") return
			const frame = new Int16Array(event.data.data)
			while (this.queue.length && (this.queue.length >= 32 || this.queuedBytes + frame.byteLength > this.limits.bytes)) {
				const dropped = this.queue.shift().byteLength
				this.droppedBytes += dropped
				this.queuedBytes -= dropped
			}
			this.queuedBytes += frame.byteLength
			this.queue.push(frame)
			this.port.postMessage({type: "play-ack", id: event.data.id})
			if (this.queue.length >= 3) this.started = true
		}
		this.metricsInterval = 0
	}

	process(_inputs, outputs) {
		const output = outputs[0][0]
		output.fill(0)
		if (!this.started) {
			this.lowWaterEvents++
			this.reportMetrics(output.length)
			return true
		}
		for (let index = 0; index < output.length; index++) {
			if (!this.current || this.offset >= this.current.length) {
				if (this.current) this.queuedBytes -= this.current.byteLength
				this.current = this.queue.shift() || null
				this.offset = 0
			}
			if (!this.current) {
				this.underrunEvents++
				this.started = false
				break
			}
			output[index] = this.current[this.offset++] / 32768
		}
		this.reportMetrics(output.length)
		return true
	}

	reportMetrics(samples) {
		this.metricsInterval += samples
		if (this.metricsInterval < sampleRate) return
		this.metricsInterval = 0
		const queuedSamples = this.queue.reduce((total, frame) => total + frame.length, 0) + (this.current ? this.current.length - this.offset : 0)
		this.port.postMessage({type: "metrics", metrics: {
			bufferedMs: Math.round(queuedSamples / sampleRate * 1000),
			lowWaterEvents: this.lowWaterEvents,
			underrunEvents: this.underrunEvents,
			droppedBytes: this.droppedBytes
		}})
	}
}

registerProcessor("cloudsat-playback", PlaybackProcessor)
