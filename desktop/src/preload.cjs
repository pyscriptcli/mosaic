const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("mosaicDesktop", Object.freeze({
  scheduleReminder: (input) => ipcRenderer.send("mosaic:reminder-schedule", input),
  respondToReminder: (action) => {
    if (action === "dismiss" || action === "snooze") ipcRenderer.send("mosaic:reminder-response", action);
  },
}));
