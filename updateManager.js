const { autoUpdater } = require('electron-updater');
const { dialog } = require('electron');

class updateManager {
  constructor(mainWindow) {
    this.mainWindow = mainWindow;
    this.updateAvailable = false;
    this.updateDownloaded = false;
    this.updateInfo = null;
    
    // Configure auto-updater
    autoUpdater.autoDownload = false; // Don't auto-download, let user choose
    autoUpdater.autoInstallOnAppQuit = true;
    
    this.setupListeners();
  }

  setupListeners() {
    // When update is available
    autoUpdater.on('update-available', (info) => {
      console.log('Update available:', info);
      this.updateAvailable = true;
      this.updateInfo = info;
      
      // Notify renderer process
      if (this.mainWindow && this.mainWindow.webContents) {
        this.mainWindow.webContents.send('update-available', {
          version: info.version,
          releaseNotes: info.releaseNotes,
          releaseDate: info.releaseDate
        });
      }
    });

    // When no update is available
    autoUpdater.on('update-not-available', (info) => {
      console.log('Update not available');
      if (this.mainWindow && this.mainWindow.webContents) {
        this.mainWindow.webContents.send('update-not-available');
      }
    });

    // Download progress
    autoUpdater.on('download-progress', (progressObj) => {
      console.log(`Download speed: ${progressObj.bytesPerSecond} - Downloaded ${progressObj.percent}%`);
      if (this.mainWindow && this.mainWindow.webContents) {
        this.mainWindow.webContents.send('download-progress', {
          percent: progressObj.percent,
          transferred: progressObj.transferred,
          total: progressObj.total
        });
      }
    });

    // When update is downloaded
    autoUpdater.on('update-downloaded', (info) => {
      console.log('Update downloaded');
      this.updateDownloaded = true;
      
      if (this.mainWindow && this.mainWindow.webContents) {
        this.mainWindow.webContents.send('update-downloaded', {
          version: info.version
        });
      }
      
      // Show dialog to install now or later
      const response = dialog.showMessageBoxSync(this.mainWindow, {
        type: 'info',
        title: 'Update Ready',
        message: 'A new update has been downloaded. Restart now to install?',
        buttons: ['Restart Now', 'Later'],
        defaultId: 0
      });

      if (response === 0) {
        autoUpdater.quitAndInstall(false, true);
      }
    });

    // Error handling
    autoUpdater.on('error', (error) => {
      console.error('Auto-updater error:', error);
      if (this.mainWindow && this.mainWindow.webContents) {
        this.mainWindow.webContents.send('update-error', {
          message: error.message
        });
      }
    });
  }

  // Check for updates (can be called manually)
  async checkForUpdates() {
    try {
      console.log('Checking for updates...');
      const result = await autoUpdater.checkForUpdates();
      return result;
    } catch (error) {
      console.error('Error checking for updates:', error);
      throw error;
    }
  }

  // Download update
  async downloadUpdate() {
    try {
      if (!this.updateAvailable) {
        throw new Error('No update available');
      }
      console.log('Starting download...');
      await autoUpdater.downloadUpdate();
    } catch (error) {
      console.error('Error downloading update:', error);
      throw error;
    }
  }

  // Install update and restart
  quitAndInstall() {
    if (this.updateDownloaded) {
      autoUpdater.quitAndInstall(false, true);
    }
  }

  // Get current version
  getCurrentVersion() {
    return autoUpdater.currentVersion.version;
  }

  // Get update info
  getUpdateInfo() {
    return {
      updateAvailable: this.updateAvailable,
      updateDownloaded: this.updateDownloaded,
      updateInfo: this.updateInfo,
      currentVersion: this.getCurrentVersion()
    };
  }
}

module.exports = updateManager;