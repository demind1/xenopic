import { contextBridge, ipcRenderer, webUtils } from "electron";
import type { DesktopAPI } from "../src/core/bridge";
const api: DesktopAPI = {
  importMedia: () => ipcRenderer.invoke("media:import"),
  importPaths: (paths) => ipcRenderer.invoke("media:paths", paths),
  pathForFile: (file) => webUtils.getPathForFile(file),
  save: (p) => ipcRenderer.invoke("project:save", p),
  open: () => ipcRenderer.invoke("project:open"),
  beginExport: (p, s) => ipcRenderer.invoke("export:begin", p, s),
  frame: (bytes) => ipcRenderer.invoke("export:frame", bytes),
  finishExport: () => ipcRenderer.invoke("export:finish"),
  cancelExport: () => ipcRenderer.invoke("export:cancel"),
};
contextBridge.exposeInMainWorld("nightframe", api);
