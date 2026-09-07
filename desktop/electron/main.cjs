const { app, BrowserWindow, shell } = require("electron");
const path = require("node:path");

if (process.platform === "win32") {
  app.setAppUserModelId("com.almarinezb.scribe");
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 680,
    backgroundColor: "#f4f0e7",
    title: "Scribe — MP3 to Text",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) shell.openExternal(url);
    return { action: "deny" };
  });

  window.webContents.on("will-navigate", (event, url) => {
    const current = window.webContents.getURL();
    if (url !== current) event.preventDefault();
  });

  const devUrl = process.env.SCRIBE_DEV_URL;
  if (devUrl) window.loadURL(devUrl);
  else window.loadFile(path.join(__dirname, "..", "dist", "index.html"));

  if (process.env.SCRIBE_SMOKE_TEST === "1") {
    const failTimer = setTimeout(() => {
      console.error("Scribe smoke test timed out.");
      app.exit(1);
    }, 20000);
    window.webContents.once("did-finish-load", async () => {
      try {
        const result = await window.webContents.executeJavaScript(`({
          title: document.title,
          heading: document.querySelector('h1')?.textContent,
          chooseButton: document.querySelector('.secondary-button')?.textContent,
          workerAssets: [...document.scripts].map((item) => item.src).length
        })`);
        console.log(`Scribe smoke test passed: ${JSON.stringify(result)}`);
        clearTimeout(failTimer);
        app.exit(0);
      } catch (error) {
        console.error(error);
        clearTimeout(failTimer);
        app.exit(1);
      }
    });
  }
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
