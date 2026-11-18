<template>
	<div>
		<label><span>{{ $t("fields.serialPort") }}</span><select v-model="model.path" required><option value="">{{ $t("fields.selectDevice") }}</option><option v-for="port in ports" v-bind:key="port.path" v-bind:value="port.path">{{ port.friendlyName || port.path }}</option></select></label>
		<div class="field-row"><label><span>{{ $t("fields.baudRate") }}</span><input v-model.number="model.baudRate" type="number" min="1" max="4000000" required></label><label><span>{{ $t("fields.connectionMode") }}</span><select v-model="model.connectionMode"><option value="serial_bridge">{{ $t("serialModes.serial_bridge") }}</option><option value="native_usb_cdc">{{ $t("serialModes.native_usb_cdc") }}</option><option value="no_control_lines">{{ $t("serialModes.no_control_lines") }}</option></select></label></div>
		<p v-if="model.connectionMode === 'native_usb_cdc'">{{ $t("serialModes.cdcHelp") }}</p>
	</div>
</template>

<script>
export default {
	name: "SerialFields",
	props: {modelValue: {type: Object, required: true}, ports: {type: Array, default: () => []}},
	emits: ["update:modelValue"],
	computed: {
		model: {
			get() { return this.modelValue },
			set(value) { this.$emit("update:modelValue", value) }
		}
	}
}
</script>
