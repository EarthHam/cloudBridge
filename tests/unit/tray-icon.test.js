import path from "node:path"
import {describe, expect, it, vi} from "vitest"
import trayIcon from "../../src/main/trayIcon.cjs"

const {loadTrayIcon} = trayIcon

describe("tray icon loading", () => {
	it.each([
		["win32", "icon.ico"],
		["darwin", "iconTemplate.png"],
		["linux", "icon.png"]
	])("loads the %s icon in development and packaged apps", (platform, filename) => {
		for (const isPackaged of [false, true]) {
			const icon = {isEmpty: () => false, setTemplateImage: vi.fn()}
			const nativeImage = {createFromPath: vi.fn(() => icon)}
			const appRoot = path.resolve("source"), resourcesPath = path.resolve("installed", "resources")
			const expectedPath = path.join(isPackaged ? resourcesPath : appRoot, isPackaged ? "icons" : "build", filename)
			const result = loadTrayIcon({nativeImage, platform, appRoot, resourcesPath, isPackaged})
			expect(nativeImage.createFromPath).toHaveBeenCalledWith(expectedPath)
			expect(result).toBe(platform === "win32" ? expectedPath : icon)
			if (platform === "darwin") expect(icon.setTemplateImage).toHaveBeenCalledWith(true)
			else expect(icon.setTemplateImage).not.toHaveBeenCalled()
		}
	})

	it("reports a missing or invalid icon instead of creating an invisible tray", () => {
		const nativeImage = {createFromPath: () => ({isEmpty: () => true})}
		expect(() => loadTrayIcon({nativeImage, platform: "win32", appRoot: "/source", resourcesPath: "/resources", isPackaged: true})).toThrow("Unable to load tray icon:")
	})
})
