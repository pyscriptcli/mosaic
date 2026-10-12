const { app, BrowserWindow, desktopCapturer, dialog, ipcMain, Menu, nativeImage, session, shell, Tray } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const APP_ORIGIN = loadAppOrigin();
const APP_PARTITION = "persist:mosaic";
const CLICKUP_HOST = "clickup.com";
let mainWindow;
let reminderWindow;
let reminderTimer;
let reminderCanClose = false;
let tray;
let isQuitting = false;
let settings = { startWithWindows: false, closeToTrayNoticeShown: false, mediaPermissionGranted: false };

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => showMainWindow());
  app.on("session-end", () => { isQuitting = true; });

  app.whenReady().then(() => {
    app.setAppUserModelId("com.primephilippines.mosaic");
    readSettings();
    setPermissionPolicy();
    createTray();
    createMainWindow();
    applyStartupSetting();

    app.on("activate", showMainWindow);
  });

  app.on("before-quit", (event) => {
    if (isQuitting) return;
    event.preventDefault();
    confirmQuit();
  });

  app.on("will-quit", () => {
    if (tray && !tray.isDestroyed()) tray.destroy();
  });
}

function loadAppOrigin() {
  const configured = process.env.MOSAIC_APP_URL;
  if (configured && !app.isPackaged) return validateOrigin(configured);

  const configPath = app.isPackaged
    ? path.join(process.resourcesPath, "app-origin.json")
    : path.join(__dirname, "..", "build", "app-origin.json");

  try {
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    return validateOrigin(config.origin);
  } catch (error) {
    console.error("Mosaic app origin is missing or invalid:", error.message);
    return null;
  }
}

function validateOrigin(value) {
  const parsed = new URL(value);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new Error("MOSAIC_APP_URL must be an HTTPS origin without a path, query, or fragment.");
  }
  return parsed.origin;
}

function readSettings() {
  const settingsPath = path.join(app.getPath("userData"), "settings.json");
  try {
    const saved = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    settings = {
      startWithWindows: saved.startWithWindows === true,
      closeToTrayNoticeShown: saved.closeToTrayNoticeShown === true,
      mediaPermissionGranted: saved.mediaPermissionGranted === true,
      reminder: saved.reminder && saved.reminder.enabled === true && Number.isFinite(Number(saved.reminder.intervalSeconds))
        ? { enabled: true, intervalSeconds: Math.max(1, Math.min(359999, Number(saved.reminder.intervalSeconds))), nextAt: Number.isFinite(Number(saved.reminder.nextAt)) ? Number(saved.reminder.nextAt) : Date.now() + 30 * 60_000, taskNames: [] }
        : null,
    };
  } catch {
    // A missing or unreadable preference file uses safe defaults.
  }
}

function saveSettings() {
  const settingsPath = path.join(app.getPath("userData"), "settings.json");
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  const saved = { ...settings, reminder: settings.reminder ? { enabled: true, intervalSeconds: settings.reminder.intervalSeconds, nextAt: settings.reminder.nextAt, taskNames: [] } : null };
  fs.writeFileSync(settingsPath, `${JSON.stringify(saved, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
}

function isAppOrigin(value) {
  try {
    return Boolean(APP_ORIGIN) && new URL(value).origin === APP_ORIGIN;
  } catch {
    return false;
  }
}

function isClickUpPage(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (url.hostname === CLICKUP_HOST || url.hostname.endsWith(`.${CLICKUP_HOST}`));
  } catch {
    return false;
  }
}

function setPermissionPolicy() {
  const mosaicSession = session.fromPartition(APP_PARTITION);
  mosaicSession.setPermissionCheckHandler((webContents, permission, requestingOrigin) => {
    const isTrustedFrame = webContents && webContents.getURL() && isAppOrigin(webContents.getURL());
    if (!isTrustedFrame || !requestingOrigin || !isAppOrigin(requestingOrigin)) return false;
    if (permission === "media") return settings.mediaPermissionGranted;
    return permission === "display-capture";
  });
  mosaicSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const pageUrl = webContents && webContents.getURL();
    const requestingUrl = details && (details.requestingUrl || details.securityOrigin);
    const isTrustedRequest = Boolean(pageUrl && isAppOrigin(pageUrl) && requestingUrl && isAppOrigin(requestingUrl));
    if (!isTrustedRequest) return callback(false);
    if (permission === "display-capture") return callback(true);
    if (permission !== "media") return callback(false);
    if (settings.mediaPermissionGranted) return callback(true);

    const result = dialog.showMessageBoxSync(mainWindow || undefined, {
      type: "question",
      title: "Allow media access?",
      message: "Allow Mosaic to use this device's microphone or camera?",
      detail: "You can reset this permission from the Mosaic tray menu.",
      buttons: ["Don't allow", "Allow"],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    });
    settings.mediaPermissionGranted = result === 1;
    saveSettings();
    callback(settings.mediaPermissionGranted);
  });

  mosaicSession.setDisplayMediaRequestHandler(async (request, callback) => {
    const frame = request.frame;
    const isTopLevelMosaicRequest = Boolean(
      APP_ORIGIN && frame && frame === frame.top && isAppOrigin(request.securityOrigin) &&
      request.userGesture && mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible(),
    );
    if (!isTopLevelMosaicRequest) return callback(null);

    try {
      const sources = await desktopCapturer.getSources({
        types: ["screen", "window"],
        thumbnailSize: { width: 0, height: 0 },
        fetchWindowIcons: false,
      });
      if (sources.length === 0) return callback(null);

      const sourceNames = sources.map((source, index) => `${index + 1}. ${source.name}`);
      const choice = dialog.showMessageBoxSync(mainWindow, {
        type: "question",
        title: "Choose what to share",
        message: "Choose a screen or window for this meeting.",
        detail: sourceNames.join("\n"),
        buttons: sources.map((_source, index) => `Share ${index + 1}`).concat("Cancel"),
        defaultId: 0,
        cancelId: sources.length,
        noLink: true,
      });
      const selectedSource = sources[choice];
      if (!selectedSource) return callback(null);

      let includeSystemAudio = false;
      if (request.audioRequested) {
        const audioChoice = dialog.showMessageBoxSync(mainWindow, {
          type: "question",
          title: "Include meeting audio?",
          message: "Include audio playing on this device?",
          detail: "This can include other sounds from your computer.",
          buttons: ["Without system audio", "Include system audio", "Cancel"],
          defaultId: 0,
          cancelId: 2,
          noLink: true,
        });
        if (audioChoice === 2) return callback(null);
        includeSystemAudio = audioChoice === 1;
      }

      callback({
        video: selectedSource,
        ...(includeSystemAudio ? { audio: "loopback" } : {}),
      });
    } catch (error) {
      console.error("Screen selection failed:", error.message);
      callback(null);
    }
  });
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 960,
    minHeight: 640,
    show: !process.argv.includes("--hidden"),
    backgroundColor: "#FFFCFB",
      icon: path.join(__dirname, "..", "build", "mosaic.ico"),
    autoHideMenuBar: true,
    webPreferences: {
      session: session.fromPartition(APP_PARTITION),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isClickUpPage(url)) {
      mainWindow.webContents.loadURL(url).catch(showConnectionError);
    } else {
      openExternalUrl(url);
    }
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (isAppOrigin(url) || isClickUpPage(url) || url.startsWith("data:text/html")) return;
    event.preventDefault();
    openExternalUrl(url);
  });

  mainWindow.webContents.on("will-redirect", (event, url) => {
    if (isAppOrigin(url) || isClickUpPage(url)) return;
    event.preventDefault();
    openExternalUrl(url);
  });

  mainWindow.webContents.on("did-fail-load", (_event, errorCode, description, _url, isMainFrame) => {
    if (isMainFrame && errorCode !== -3) showConnectionError(description);
  });

  mainWindow.webContents.on("render-process-gone", () => showConnectionError("Mosaic had to restart this page."));

  mainWindow.on("close", (event) => {
    if (isQuitting) return;
    event.preventDefault();
    mainWindow.hide();
    if (!settings.closeToTrayNoticeShown) {
      settings.closeToTrayNoticeShown = true;
      saveSettings();
      dialog.showMessageBox({
        type: "info",
        title: "Mosaic is still running",
        message: "Mosaic is in the system tray. Choose Open Mosaic to return, or Quit Mosaic to close it.",
        buttons: ["Got it"],
      });
    }
  });

  if (APP_ORIGIN) {
    mainWindow.loadURL(APP_ORIGIN).catch(showConnectionError);
  } else {
    showConnectionError("This Mosaic installer was built without a valid app origin. Rebuild it with MOSAIC_APP_URL set to the deployed HTTPS origin.");
  }
}

function showConnectionError(reason = "Mosaic could not connect to the workspace.") {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const safeReason = String(reason).replace(/[<>&"']/g, "");
  const retryScript = APP_ORIGIN ? `location.href=${JSON.stringify(APP_ORIGIN)}` : "location.reload()";
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mosaic connection</title><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#FFFCFB;color:#003366;font:16px Arial,sans-serif"><main style="max-width:480px;padding:32px;text-align:center"><h1 style="font-size:28px">Mosaic is unavailable</h1><p>${safeReason}</p><button onclick="${retryScript}" style="border:0;background:#003366;color:white;padding:12px 22px;font-size:15px;cursor:pointer">Try again</button></main></body></html>`;
  mainWindow.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(html)}`).catch(() => {});
}

function openExternalUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol === "https:" || (url.protocol === "mailto:" && !url.pathname.startsWith("//"))) {
      shell.openExternal(url.toString()).catch((error) => console.error("Could not open external link:", error.message));
    }
  } catch {
    // Invalid and non-web schemes stay blocked.
  }
}

function createTray() {
  const iconPath = path.join(__dirname, "..", "build", "mosaic.png");
  const icon = nativeImage.createFromPath(iconPath);
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
  tray.setToolTip("Mosaic");
  tray.setContextMenu(buildTrayMenu());
  tray.on("double-click", showMainWindow);
}

function buildTrayMenu() {
  return Menu.buildFromTemplate([
    { label: "Open Mosaic", click: showMainWindow },
    { type: "separator" },
    {
      label: "Start with Windows",
      type: "checkbox",
      checked: settings.startWithWindows,
      click: (item) => {
        settings.startWithWindows = item.checked;
        saveSettings();
        applyStartupSetting();
        tray.setContextMenu(buildTrayMenu());
      },
    },
    {
      label: "Reset microphone and camera permission",
      enabled: settings.mediaPermissionGranted,
      click: () => {
        settings.mediaPermissionGranted = false;
        saveSettings();
        tray.setContextMenu(buildTrayMenu());
      },
    },
    { type: "separator" },
    { label: "Quit Mosaic", click: confirmQuit },
  ]);
}

function applyStartupSetting() {
  app.setLoginItemSettings({
    openAtLogin: settings.startWithWindows,
    args: settings.startWithWindows ? ["--hidden"] : [],
  });
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createMainWindow();
    registerReminderBridge();
    scheduleNextReminder();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function confirmQuit() {
  if (isQuitting) return;
  const result = dialog.showMessageBoxSync(mainWindow || undefined, {
    type: "warning",
    title: "Quit Mosaic?",
    message: "Quit Mosaic and close any work still open in the app?",
    detail: "Unsaved changes or active recording may be interrupted.",
    buttons: ["Keep Mosaic running", "Quit Mosaic"],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
  });
  if (result !== 1) return;
  isQuitting = true;
  app.quit();
}

function registerReminderBridge() {
  ipcMain.on("mosaic:reminder-schedule", (event, input) => {
    if (!mainWindow || event.sender !== mainWindow.webContents || !isAppOrigin(event.senderFrame?.url || "")) return;
    if (!input || typeof input.enabled !== "boolean") return;
    const intervalSeconds = Math.floor(Number(input.intervalSeconds));
    if (!Number.isFinite(intervalSeconds) || intervalSeconds < 1 || intervalSeconds > 359999) return;
    settings.reminder = input.enabled ? {
      enabled: true,
      intervalSeconds,
      taskNames: Array.isArray(input.taskNames) ? input.taskNames.filter((name) => typeof name === "string").slice(0, 8).map((name) => name.slice(0, 160)) : [],
      nextAt: settings.reminder?.enabled && settings.reminder.intervalSeconds === intervalSeconds && settings.reminder.nextAt > Date.now()
        ? settings.reminder.nextAt : Date.now() + intervalSeconds * 1000,
    } : null;
    saveSettings();
    scheduleNextReminder();
  });
  ipcMain.on("mosaic:reminder-response", (event, action) => {
    if (!reminderWindow || event.sender !== reminderWindow.webContents || (action !== "dismiss" && action !== "snooze")) return;
    reminderCanClose = true;
    reminderWindow.close();
    if (settings.reminder?.enabled) {
      settings.reminder.nextAt = Date.now() + settings.reminder.intervalSeconds * 1000;
      saveSettings();
      scheduleNextReminder();
    }
  });
}

function scheduleNextReminder() {
  if (reminderTimer) clearTimeout(reminderTimer);
  if (!settings.reminder?.enabled || isQuitting) return;
  reminderTimer = setTimeout(() => {
    settings.reminder.nextAt = Date.now() + settings.reminder.intervalSeconds * 1000;
    saveSettings();
    showReminderWindow();
  }, Math.max(0, settings.reminder.nextAt - Date.now()));
}

function showReminderWindow() {
  if (reminderWindow && !reminderWindow.isDestroyed()) return reminderWindow.focus();
  reminderWindow = new BrowserWindow({
    width: 720, height: 560, minWidth: 520, minHeight: 420,
    show: false, frame: false, resizable: false, backgroundColor: "#FFFCFB",
    alwaysOnTop: true, skipTaskbar: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, preload: path.join(__dirname, "preload.cjs"), webSecurity: true },
  });
  reminderWindow.setAlwaysOnTop(true, "screen-saver");
  reminderCanClose = false;
  reminderWindow.loadFile(path.join(__dirname, "reminder.html"), { query: { tasks: JSON.stringify(settings.reminder?.taskNames || []) } });
  reminderWindow.once("ready-to-show", () => { reminderWindow?.show(); reminderWindow?.focus(); });
  reminderWindow.on("close", (event) => {
    if (!reminderCanClose && !isQuitting) event.preventDefault();
  });
  reminderWindow.on("closed", () => { reminderWindow = null; scheduleNextReminder(); });
}
