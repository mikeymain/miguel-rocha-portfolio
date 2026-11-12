const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("daybook", {
  request: (action) => ipcRenderer.invoke("daybook:request", action),
  subscribe: (callback) => {
    const listener = (_, state) => callback(state);
    ipcRenderer.on("daybook:state", listener);
    return () => ipcRenderer.removeListener("daybook:state", listener);
  },
});
