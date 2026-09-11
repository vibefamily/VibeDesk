import { contextBridge as p, ipcRenderer as e } from "electron";
const t = {
  // App info
  getAppInfo: () => e.invoke("app:getInfo"),
  ping: () => e.invoke("app:ping"),
  // Event listeners
  on: (n, o) => {
    ["market:tick", "order:update", "agent:proposal"].includes(n) && e.on(n, (r, ...i) => o(...i));
  }
};
p.exposeInMainWorld("vibeAPI", t);
