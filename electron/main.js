const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');
const isDev = require('electron-is-dev');

let server;
let mainWindow;
let isServerReady = false;

/**
 * Start Express Server
 * The server is started as a child process before Electron window is created
 */
function startServer() {
  return new Promise((resolve) => {
    try {
      const serverModule = require('../app');
      const port = serverModule.getServerPort?.() || 3000;
      
      // Check if server is listening
      const checkServer = () => {
        try {
          const http = require('http');
          http.get(`http://localhost:${port}`, (res) => {
            if (res.statusCode === 200) {
              isServerReady = true;
              resolve();
            } else {
              setTimeout(checkServer, 500);
            }
          }).on('error', () => {
            setTimeout(checkServer, 500);
          });
        } catch (err) {
          setTimeout(checkServer, 500);
        }
      };
      
      setTimeout(checkServer, 1000);
    } catch (error) {
      console.error('Failed to start server:', error);
      resolve(); // Continue anyway
    }
  });
}

/**
 * Create Application Window
 */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1500,
    height: 950,
    minWidth: 1200,
    minHeight: 800,
    icon: path.join(__dirname, '..', 'public', 'images', 'icon.ico'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  const port = 3000;
  const url = isDev 
    ? `http://localhost:${port}` 
    : `http://localhost:${port}`;
  
  mainWindow.loadURL(url);

  // Open DevTools in development
  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/**
 * Create Application Menu
 */
function createMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Exit',
          accelerator: 'CmdOrCtrl+Q',
          click: () => {
            app.quit();
          },
        },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About BsmartQ Desktop',
          click: () => {
            // Could open an about dialog here
          },
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

/**
 * Application Ready
 */
app.on('ready', async () => {
  await startServer();
  createWindow();
  createMenu();
});

/**
 * Window Activation
 */
app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

/**
 * Window Closed
 */
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
