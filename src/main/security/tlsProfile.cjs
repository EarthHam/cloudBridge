const tls = require("node:tls")
const {X509Certificate, createPrivateKey} = require("node:crypto")
const {AppError} = require("../errors/AppError.cjs")

const validateTlsMaterial = (certificatePem, privateKeyPem, now = new Date()) => {
	try { tls.createSecureContext({cert: certificatePem, key: privateKeyPem}) } catch (error) {
		throw new AppError("TLS_INVALID", `Certificate and key are invalid: ${error.message}`)
	}
	let certificate
	try { certificate = new X509Certificate(certificatePem) } catch (error) {
		throw new AppError("TLS_INVALID", `Unable to parse certificate: ${error.message}`)
	}
	let privateKey
	try { privateKey = createPrivateKey(privateKeyPem) } catch (error) {
		throw new AppError("TLS_INVALID", `Unable to parse private key: ${error.message}`)
	}
	if (!certificate.checkPrivateKey(privateKey)) throw new AppError("TLS_KEY_MISMATCH", "The private key does not match the certificate")
	const validFrom = new Date(certificate.validFrom)
	const validTo = new Date(certificate.validTo)
	if (Number.isNaN(validFrom.valueOf()) || Number.isNaN(validTo.valueOf())) throw new AppError("TLS_INVALID", "Certificate validity dates are invalid")
	if (now < validFrom) throw new AppError("TLS_NOT_ACTIVE", "The certificate is not valid yet", {validFrom: validFrom.toISOString()})
	if (now >= validTo) throw new AppError("TLS_EXPIRED", "The certificate has expired", {expiresAt: validTo.toISOString()})
	return {validFrom: validFrom.toISOString(), expiresAt: validTo.toISOString()}
}

module.exports = {validateTlsMaterial}
