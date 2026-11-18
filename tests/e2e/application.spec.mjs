import fs from "node:fs/promises"
import net from "node:net"
import WebSocket from "ws"
import os from "node:os"
import path from "node:path"
import {fileURLToPath} from "node:url"
import {expect, test, _electron as electron} from "@playwright/test"

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")

const freePort = () => new Promise((resolve, reject) => {
	const server = net.createServer()
	server.once("error", reject)
	server.listen(0, "127.0.0.1", () => {
		const {port} = server.address()
		server.close(error => error ? reject(error) : resolve(port))
	})
})

const connectOnce = port => new Promise((resolve, reject) => {
	const socket = net.createConnection({host: "127.0.0.1", port})
	const timer = setTimeout(() => { socket.destroy(); reject(new Error("TCP listener connection timed out")) }, 5000)
	socket.once("connect", () => { clearTimeout(timer); socket.end(); resolve() })
	socket.once("error", error => { clearTimeout(timer); reject(error) })
})

test("completes onboarding and runs a TCP forwarding instance", async () => {
	const userData = await fs.mkdtemp(path.join(os.tmpdir(), "cloudsat-e2e-"))
	const listenPort = await freePort()
	const executablePath = process.env.CLOUD_BRIDGE_EXECUTABLE
	const electronApp = await electron.launch({
		...(executablePath ? {executablePath} : {args: [projectRoot]}),
		cwd: projectRoot,
		env: {...process.env, CLOUD_BRIDGE_USER_DATA: userData}
	})
	try {
		const page = await electronApp.firstWindow()
		const pageErrors = []
		page.on("pageerror", error => pageErrors.push(error.message))
		await expect(page).toHaveTitle("cloudBridge")
		await expect(page.getByRole("heading", {name: "连接你的卫星电台"})).toBeVisible()
		await page.getByText("开始使用", {exact: true}).click()
		await expect(page.getByRole("heading", {name: "桥接实例", exact: true})).toBeVisible()

		await page.getByText("Cloud Sat电台", {exact: true}).first().click()
		await expect(page.getByText("Cloud Sat 电台仅允许本机", {exact: false})).toBeVisible()
		await expect(page.getByLabel("监听地址")).toHaveValue("0.0.0.0")
		expect(await page.getByLabel("监听地址").locator("option").allTextContents()).toEqual([
			"仅局域网 IPv4 + IPv6 (::)", "仅局域网 IPv4 (0.0.0.0)", "仅本机 IPv6 (::1)", "仅本机 IPv4 (127.0.0.1)"
		])
		await expect(page.getByLabel("要求设备认证")).toBeChecked()
		await expect(page.getByLabel("TLS配置")).toBeVisible()
		await page.locator("header").getByText("取消", {exact: true}).click()
		await page.getByText("TCP → Serial", {exact: true}).first().click()
		await expect(page.getByLabel("TLS配置")).toHaveCount(0)
		await expect(page.getByText("普通 TCP，传输未加密", {exact: true})).toBeVisible()
		await page.locator("header").getByText("取消", {exact: true}).click()
		await page.getByText("TCP → TCP", {exact: true}).first().click()
		await expect(page.getByLabel("TLS配置")).toHaveCount(0)
		await expect(page.getByText("普通 TCP，传输未加密", {exact: true})).toBeVisible()
		await expect(page.getByRole("heading", {name: "新建实例"})).toBeVisible()
		const bindHost = page.getByLabel("监听地址")
		await expect(bindHost).toHaveValue("0.0.0.0")
		expect(await bindHost.locator("option").allTextContents()).toEqual([
			"仅局域网 IPv4 + IPv6 (::)",
			"仅局域网 IPv4 (0.0.0.0)",
			"仅本机 IPv6 (::1)",
			"仅本机 IPv4 (127.0.0.1)"
		])
		await page.getByLabel("实例名称").fill("E2E TCP Bridge")
		await page.getByLabel("监听端口").fill(String(listenPort))
		await page.getByLabel("远端TCP端口").fill("9")
		await page.getByText("保存", {exact: true}).last().click()

		await page.waitForTimeout(500)
		expect(await page.locator(".error-box").allTextContents()).toEqual([])
		const card = page.locator(".instance-card", {hasText: "E2E TCP Bridge"})
		await expect(card).toBeVisible()
		await card.getByText("启动", {exact: true}).click()
		await expect(card.getByText("运行中", {exact: true})).toBeVisible()
		await connectOnce(listenPort)
		await card.getByText("停止", {exact: true}).click()
		await expect(card.getByText("已停止", {exact: true})).toBeVisible()
		await page.getByText("WebSocket → TCP", {exact: true}).first().click()
		await expect(page.getByLabel("TLS配置")).toBeVisible()
		await expect(page.getByText("普通 TCP，传输未加密", {exact: true})).toHaveCount(0)
		await expect(page.getByText("高级转发仅允许本机", {exact: false})).toBeVisible()
		const origins = page.getByLabel("允许的网页来源")
		await expect(origins).toHaveValue("https://ptz.cloudsat.cn\nhttps://m.cloudsat.cn\nhttps://mapp.cloudsat.cn\napp://cloudsat")
		await origins.fill("https://allowed.example")
		const wsPort = await freePort()
		await page.getByLabel("实例名称").fill("E2E LAN WebSocket")
		await page.getByLabel("监听端口").fill(String(wsPort))
		await page.getByLabel("远端TCP端口").fill("9")
		await page.getByText("保存", {exact: true}).last().click()
		const wsCard = page.locator(".instance-card", {hasText: "E2E LAN WebSocket"})
		await wsCard.getByText("编辑", {exact: true}).click()
		await expect(page.getByLabel("允许的网页来源")).toHaveValue("https://allowed.example")
		await page.getByText("保存", {exact: true}).last().click()
		await wsCard.getByText("启动", {exact: true}).click()
		await expect(wsCard.getByText("运行中", {exact: true})).toBeVisible()
		await expect(new Promise((resolve, reject) => {
			const client = new WebSocket(`ws://127.0.0.1:${wsPort}/`, {origin: "https://evil.example"})
			client.once("open", () => { client.terminate(); resolve() }); client.once("error", reject)
		})).rejects.toThrow("403")
		await new Promise((resolve, reject) => {
			const client = new WebSocket(`ws://127.0.0.1:${wsPort}/`, {origin: "https://allowed.example"})
			client.once("open", () => client.close()); client.once("close", resolve); client.once("error", reject)
		})
		await wsCard.getByText("停止", {exact: true}).click()
		await expect(wsCard.getByText("已停止", {exact: true})).toBeVisible()
		expect(pageErrors).toEqual([])
	} finally {
		await electronApp.close()
		await fs.rm(userData, {recursive: true, force: true})
	}
})
