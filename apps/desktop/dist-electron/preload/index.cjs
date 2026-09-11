var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
import { contextBridge, ipcRenderer } from "electron";
var require_index = __commonJS({
  "index.cjs"() {
    const vibeAPI = {
      // App info
      getAppInfo: () => ipcRenderer.invoke("app:getInfo"),
      ping: () => ipcRenderer.invoke("app:ping"),
      // Wallet (secrets stay in the main process)
      wallet: {
        getState: () => ipcRenderer.invoke("wallet:getState"),
        unlock: (password) => ipcRenderer.invoke("wallet:unlock", password),
        lock: () => ipcRenderer.invoke("wallet:lock"),
        createHd: (args) => ipcRenderer.invoke("wallet:createHd", args),
        importHd: (args) => ipcRenderer.invoke("wallet:importHd", args),
        deriveMore: (args) => ipcRenderer.invoke("wallet:deriveMore", args),
        importPrivateKey: (args) => ipcRenderer.invoke("wallet:importPrivateKey", args),
        importKeystore: (args) => ipcRenderer.invoke("wallet:importKeystore", args),
        exportMnemonic: (args) => ipcRenderer.invoke("wallet:exportMnemonic", args),
        exportPrivateKey: (args) => ipcRenderer.invoke("wallet:exportPrivateKey", args),
        exportKeystore: (args) => ipcRenderer.invoke("wallet:exportKeystore", args),
        authorizeAgent: (args) => ipcRenderer.invoke("wallet:authorizeAgent", args),
        revokeAgent: (args) => ipcRenderer.invoke("wallet:revokeAgent", args),
        revokeAll: () => ipcRenderer.invoke("wallet:revokeAll"),
        remove: (args) => ipcRenderer.invoke("wallet:remove", args)
      },
      // Event listeners
      on: (channel, callback) => {
        const validChannels = ["market:tick", "order:update", "agent:proposal"];
        if (validChannels.includes(channel)) {
          ipcRenderer.on(channel, (_event, ...args) => callback(...args));
        }
      }
    };
    contextBridge.exposeInMainWorld("vibeAPI", vibeAPI);
  }
});
export default require_index();
