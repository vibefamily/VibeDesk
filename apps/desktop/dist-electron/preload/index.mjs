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
  skills: {
    list: () => ipcRenderer.invoke("skills:list"),
    saveConfig: (args) => ipcRenderer.invoke("skills:saveConfig", args),
    testConnection: (args) => ipcRenderer.invoke("skills:testConnection", args)
  },
  agent: {
    listDataSources: () => ipcRenderer.invoke("agent:listDataSources"),
    setDataSourceAuth: (args) => ipcRenderer.invoke("agent:setDataSourceAuth", args),
    setWalletAuth: (args) => ipcRenderer.invoke("agent:setWalletAuth", args),
    listTemplates: () => ipcRenderer.invoke("agent:listTemplates"),
    list: () => ipcRenderer.invoke("agent:list"),
    getMode: () => ipcRenderer.invoke("agent:getMode"),
    create: (args) => ipcRenderer.invoke("agent:create", args),
    start: (args) => ipcRenderer.invoke("agent:start", args),
    stop: (args) => ipcRenderer.invoke("agent:stop", args),
    remove: (args) => ipcRenderer.invoke("agent:remove", args),
    runOnce: (args) => ipcRenderer.invoke("agent:runOnce", args),
    setLlmConfig: (config) => ipcRenderer.invoke("agent:setLlmConfig", config),
    getLlmConfig: () => ipcRenderer.invoke("agent:getLlmConfig"),
    chat: (id, text) => ipcRenderer.invoke("agent:chat", { id, text }),
    probeOllama: () => ipcRenderer.invoke("agent:probeOllama"),
    testConnection: (config) => ipcRenderer.invoke("agent:testConnection", config)
  },
  // Market data (sources run in the main process)
  market: {
    getState: () => ipcRenderer.invoke("market:getState"),
    refreshSymbol: (symbol) => ipcRenderer.invoke("market:refreshSymbol", symbol)
  },
  // Info Center (M3): multi-source news/tweet pulls
  info: {
    getState: () => ipcRenderer.invoke("info:getState"),
    upsertSource: (input) => ipcRenderer.invoke("info:upsertSource", input),
    deleteSource: (id) => ipcRenderer.invoke("info:deleteSource", id),
    refreshNow: (id) => ipcRenderer.invoke("info:refreshNow", id),
    search: (query) => ipcRenderer.invoke("info:search", query)
  },
  // Event listeners
  on: (channel, callback) => {
    const validChannels = [
      "market:tick",
      "order:update",
      "agent:proposal",
      "agent:event",
      "market:ticks",
      "info:event"
    ];
    if (!validChannels.includes(channel)) return;
    const listener = (_event, ...args) => callback(...args);
    const registry = ipcRenderer.__vibeListeners ?? /* @__PURE__ */ new Map();
    let byCallback = registry.get(channel);
    if (!byCallback) {
      byCallback = /* @__PURE__ */ new Map();
      registry.set(channel, byCallback);
    }
    byCallback.set(callback, listener);
    ipcRenderer.on(channel, listener);
    return () => {
      ipcRenderer.removeListener(channel, listener);
      byCallback.delete(callback);
    };
  },
  off: (channel, callback) => {
    const registry = ipcRenderer.__vibeListeners;
    const byCallback = registry == null ? void 0 : registry.get(channel);
    const listener = byCallback == null ? void 0 : byCallback.get(callback);
    if (listener) {
      ipcRenderer.removeListener(channel, listener);
      byCallback == null ? void 0 : byCallback.delete(callback);
      return;
    }
    ipcRenderer.removeListener(channel, callback);
  }
};
contextBridge.exposeInMainWorld("vibeAPI", vibeAPI);
