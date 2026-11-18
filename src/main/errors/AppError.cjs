class AppError extends Error {
	constructor(code, message, details = null) {
		super(message)
		this.name = "AppError"
		this.code = code
		this.details = details
	}
}

const serializeError = error => ({
	code: error && error.code ? String(error.code) : "INTERNAL_ERROR",
	message: error && error.message ? String(error.message) : "Unexpected error",
	...(error && error.details ? {details: error.details} : {})
})

module.exports = {AppError, serializeError}
