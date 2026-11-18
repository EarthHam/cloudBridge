const path = require("node:path")

const loadTrayIcon = ({nativeImage, platform, appRoot, resourcesPath, isPackaged}) => {
	const directory = isPackaged ? path.join(resourcesPath, "icons") : path.join(appRoot, "build")
	const filename = platform === "win32" ? "icon.ico" : platform === "darwin" ? "iconTemplate.png" : "icon.png"
	const iconPath = path.join(directory, filename)
	const icon = nativeImage.createFromPath(iconPath)
	if (icon.isEmpty()) throw new Error(`Unable to load tray icon: ${iconPath}`)
	if (platform === "darwin") icon.setTemplateImage(true)
	// Pass the ICO path directly so Windows can select the best size for the display scale.
	return platform === "win32" ? iconPath : icon
}

module.exports = {loadTrayIcon}
