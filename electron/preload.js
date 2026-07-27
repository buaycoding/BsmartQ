const { contextBridge } = require('electron');
const { app } = require('electron');
const packageJson = require('../package.json');

contextBridge.exposeInMainWorld('bsmartqDesktop', {
  // Application Info
  version: packageJson.version || '1.0.0',
  appName: packageJson.name,
  description: packageJson.description,
  isDesktop: true,
  
  // System Info
  appPath: app.getAppPath?.() || '',
  appVersion: app.getVersion?.() || '1.0.0',
  
  // Platform Detection
  platform: process.platform,
  isWindows: process.platform === 'win32',
  isMac: process.platform === 'darwin',
  isLinux: process.platform === 'linux',
});
