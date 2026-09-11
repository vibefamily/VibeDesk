import { app as e, BrowserWindow as r, ipcMain as o, shell as d } from "electron";
import t from "node:path";
import { fileURLToPath as p } from "node:url";
const m = t.dirname(p(import.meta.url)), l = t.join(m, ".."), f = t.join(l, "../dist"), i = process.env.VITE_DEV_SERVER_URL;
let n = null;
function a() {
  n = new r({
    title: "Vibe - AI Trading Agent",
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    frame: !0,
    titleBarStyle: "hiddenInset",
    webPreferences: {
      preload: t.join(l, "preload/index.js"),
      nodeIntegration: !1,
      contextIsolation: !0,
      sandbox: !1
    }
  }), n.webContents.setWindowOpenHandler(({ url: s }) => (d.openExternal(s), { action: "deny" })), i ? (n.loadURL(i), n.webContents.openDevTools()) : n.loadFile(t.join(f, "index.html"));
}
function c() {
  o.handle("app:getInfo", () => ({
    version: e.getVersion(),
    name: e.getName(),
    platform: process.platform
  })), o.handle("app:ping", () => "pong");
}
e.whenReady().then(() => {
  c(), a(), e.on("activate", () => {
    r.getAllWindows().length === 0 && a();
  });
});
e.on("window-all-closed", () => {
  process.platform !== "darwin" && e.quit();
});
e.on("before-quit", () => {
  n = null;
});
