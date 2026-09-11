import { contextBridge, ipcRenderer } from "electron";
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
  // Agents (managed in the main process)
  agent: {
    listTemplates: () => ipcRenderer.invoke("agent:listTemplates"),
    list: () => ipcRenderer.invoke("agent:list"),
    getMode: () => ipcRenderer.invoke("agent:getMode"),
    create: (args) => ipcRenderer.invoke("agent:create", args),
    start: (args) => ipcRenderer.invoke("agent:start", args),
    stop: (args) => ipcRenderer.invoke("agent:stop", args),
    remove: (args) => ipcRenderer.invoke("agent:remove", args),
    runOnce: (args) => ipcRenderer.invoke("agent:runOnce", args),
    setLlmConfig: (config) => ipcRenderer.invoke("agent:setLlmConfig", config),
    getLlmConfig: () => ipcRenderer.invoke("agent:getLlmConfig")
  },
  // Market data (sources run in the main process)
  market: {
    getState: () => ipcRenderer.invoke("market:getState"),
    refreshSymbol: (symbol) => ipcRenderer.invoke("market:refreshSymbol", symbol)
  },
  // Event listeners
  on: (channel, callback) => {
    const validChannels = [
      "market:tick",
      "order:update",
      "agent:proposal",
      "agent:event",
      "market:ticks"
    ];
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, (_event, ...args) => callback(...args));
    }
  }
};
contextBridge.exposeInMainWorld("vibeAPI", vibeAPI);
