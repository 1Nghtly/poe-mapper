const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, screen, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const MapTracker = require('./maptracker');
const LabTracker = require('./labtracker');
const ActTracker = require('./acttracker');
const StarfallTracker = require('./starfalltracker');
const UpdateManager = require('./updatemanager'); 
 
// Sets the app's name, which determines the folder name in %APPDATA%
app.setName('Mapper');

let mainWindow;
let settingsWindow = null;
let tray = null;
let mapTracker;
let labTracker;
let actTracker;
let starfallTracker;
let updateManager; 

// Client.txt paths
let clientLogPath = null;
let steamLogPath = null;
let standaloneLogPath = null;
let lastProcessCheckTime = 0;
const PROCESS_CHECK_INTERVAL = 2000; // Check every 2 seconds

const debug = true;
const baseWidth = 180;
const baseHeight = 40;

// Memory management variables
let lastProcessedPosition = 0;
let isInitialRead = true;
let logWatcher = null;
let isReadingLog = false;
let processTimeout = null;
const PROCESSING_DELAY = 100;

// Variables for Summary Logging
let persistentMapCounts = {};
let countsFilePath;
let summaryLogPath;

// Declare variables
let logsDir;
let logActivity = () => {};

const defaultSettings = {
  timerColor: '#ffffff',
  mapColor: '#ffffff',
  windowX: 0,
  windowY: 0,
  scale: 1.0
};

// Runtime log for debugging
const runtimeLogPath = path.join(app.getPath('userData'), 'runtime-debug.txt');

function writeRuntimeLog(message) {
  try {
    const timestamp = new Date().toISOString();
    fs.appendFileSync(runtimeLogPath, `[${timestamp}] ${message}\n`);
  } catch (err) {
    // Silently fail
  }
}

ipcMain.handle('get-default-settings', async () => {
  return defaultSettings;
});

function logDebug(message) {
  if (debug) {
    console.log(`[MAIN] [${new Date().toISOString()}] ${message}`);
  }
}

// Simple function to check if Steam version is running
function isSteamVersionRunning() {
  try {
    const { execSync } = require('child_process');
    const processes = execSync('tasklist', { encoding: 'utf8' });
    const processesLower = processes.toLowerCase();
    
    const poeLines = processes.split('\n').filter(line => 
      line.toLowerCase().includes('pathofexile')
    );
    
    if (poeLines.length > 0) {
      writeRuntimeLog('PoE processes found:');
      poeLines.forEach(line => writeRuntimeLog(`  ${line.trim()}`));
    } else {
      writeRuntimeLog('No PoE processes found');
    }
    
    const isSteam = processesLower.includes('pathofexilesteam.exe') || 
                    processesLower.includes('pathofexile_x64steam.exe');
    
    writeRuntimeLog(`Is Steam version: ${isSteam}`);
    
    return isSteam;
  } catch (err) {
    writeRuntimeLog(`Error checking processes: ${err.message}`);
    return false;
  }
}

// Update which Client.txt we're reading based on running process
function updateActiveLogPath() {
  const now = Date.now();
  
  if (now - lastProcessCheckTime < PROCESS_CHECK_INTERVAL) {
    return;
  }
  
  lastProcessCheckTime = now;
  
  const isSteam = isSteamVersionRunning();
  
  let newPath;
  if (isSteam && steamLogPath) {
    newPath = steamLogPath;
  } else if (!isSteam && standaloneLogPath) {
    newPath = standaloneLogPath;
  } else {
    newPath = steamLogPath || standaloneLogPath;
  }
  
  writeRuntimeLog(`Current path: ${clientLogPath}`);
  writeRuntimeLog(`Should use: ${newPath} (Steam=${isSteam})`);
  
  if (newPath && newPath !== clientLogPath) {
    writeRuntimeLog(`SWITCHING CLIENT.TXT FILES:`);
    writeRuntimeLog(`  Detected: ${isSteam ? 'Steam' : 'Standalone'} version`);
    writeRuntimeLog(`  Old path: ${clientLogPath}`);
    writeRuntimeLog(`  New path: ${newPath}`);
    
    clientLogPath = newPath;
    
    try {
      lastProcessedPosition = fs.statSync(clientLogPath).size;
      isInitialRead = false;
      writeRuntimeLog(`  Reset read position to: ${lastProcessedPosition} bytes`);
    } catch (err) {
      lastProcessedPosition = 0;
      writeRuntimeLog(`  Reset read position to: 0 bytes (error: ${err.message})`);
    }
  }
}

function isHideoutLine(line) {
  if (line.includes('Generating level') && line.includes('Hideout')) {
    return true;
  }
  if (line.includes('You have entered') && line.toLowerCase().includes('hideout')) {
    return true;
  }
  if (line.includes('EnterHideout')) {
    return true;
  }
  return false;
}

function isAspirantsPlazaLine(line) {
  return line.includes('You have entered') && line.includes("Aspirants' Plaza");
}

function processLogData(data) {
  if (processTimeout) {
    clearTimeout(processTimeout);
    processTimeout = null;
  }

  const lines = data.split('\n');
  
  lines.forEach(line => {
    if (!line || line.trim().length === 0) return;

    if (line.includes("This chest is locked")) return;

    if (isHideoutLine(line)) {
      logDebug('MAIN: Hideout line detected - STOPPING ALL TIMERS');
      mainWindow.webContents.send('stop-all-timers');
      
      labTracker.processLine(line);
      starfallTracker.processLine(line);
      mapTracker.processLine(line);
      actTracker.processLine(line);
      
      updateActiveTimer();
      return;
    }

    if (isAspirantsPlazaLine(line)) {
      labTracker.processLine(line);
      updateActiveTimer();
      return;
    }

    // Process Starfall first (highest priority after lab)
    starfallTracker.processLine(line);

    labTracker.processLine(line);
    mapTracker.processLine(line);
    actTracker.processLine(line);
    
    updateActiveTimer();
  });
}

function updateActiveTimer() {
  if (labTracker.isCurrentlyInLab()) {
    mainWindow.webContents.send('update-map-count', `Lab runs: ${labTracker.getLabRunCount()}`);
    mainWindow.webContents.send('update-map-name', '');
    return;
  }
  
  if (starfallTracker.isCurrentlyInStarfall()) {
    mainWindow.webContents.send('update-map-count', `Starfall Craters: ${starfallTracker.getStarfallCount()}`);
    mainWindow.webContents.send('update-map-name', '');
    return;
  }
  
  if (mapTracker.isCurrentlyInMap()) {
    const cleanMapName = mapTracker.getCleanCurrentMapName();
    mainWindow.webContents.send('update-map-count', `Maps: ${mapTracker.getMapCount()}`);
    mainWindow.webContents.send('update-map-name', cleanMapName);
    return;
  }

  if (actTracker.isCurrentlyInAct() && actTracker.isSessionTimerRunning()) {
    const actCount = actTracker.getActCount();
    if (actCount > 0) {
      const displayName = `Act ${actCount}`;
      mainWindow.webContents.send('update-map-count', displayName);
      mainWindow.webContents.send('update-map-name', '');
    }
    return;
  }

  if (mapTracker.getMapCount() > 0) {
    mainWindow.webContents.send('update-map-count', `Maps: ${mapTracker.getMapCount()}`);
    mainWindow.webContents.send('update-map-name', '');
  } else {
    mainWindow.webContents.send('update-map-count', '');
    mainWindow.webContents.send('update-map-name', '');
  }
} 

function readLogFile() {
  if (isReadingLog) return;
  
  // Check which game is running and switch if needed
  updateActiveLogPath();
  
  if (!clientLogPath) {
    return;
  }
  
  isReadingLog = true;

  fs.stat(clientLogPath, (err, stats) => {
    if (err) {
      isReadingLog = false;
      return;
    }

    const currentSize = stats.size;
    
    if (currentSize < lastProcessedPosition) {
      lastProcessedPosition = 0;
    }

    if (currentSize <= lastProcessedPosition) {
      isReadingLog = false;
      return;
    }

    const stream = fs.createReadStream(clientLogPath, {
      start: lastProcessedPosition,
      end: currentSize,
      encoding: 'utf8',
      flags: 'r',
      autoClose: true
    });

    let data = '';
    stream.on('data', chunk => {
      data += chunk;
    });

    stream.on('end', () => {
      if (isInitialRead) {
        lastProcessedPosition = currentSize;
        isInitialRead = false;
        logDebug('Initial read skipped to end of file.');
      } else {
        if (data.length > 0) {
          processLogData(data);
        }
        lastProcessedPosition = currentSize;
      }
      isReadingLog = false;
    });

    stream.on('error', (err) => {
      isReadingLog = false;
    });
  });
}

function setupLogWatcher() {
  if (logWatcher) {
    clearInterval(logWatcher);
  }

  logDebug('Setting up polling watcher');
  
  logWatcher = setInterval(() => {
    readLogFile();
  }, 500);
}

async function createWindow() {
  writeRuntimeLog('=== APP STARTING ===');
  
  // Find Steam and Standalone Client.txt files
  const steamPaths = [
    'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Path of Exile\\logs\\Client.txt',
    'C:\\Program Files\\Steam\\steamapps\\common\\Path of Exile\\logs\\Client.txt',
    'D:\\Program Files (x86)\\Steam\\steamapps\\common\\Path of Exile\\logs\\Client.txt',
    'D:\\SteamLibrary\\steamapps\\common\\Path of Exile\\logs\\Client.txt',
    'E:\\SteamLibrary\\steamapps\\common\\Path of Exile\\logs\\Client.txt',
  ];
  
  const standalonePaths = [
    'C:\\Program Files (x86)\\Grinding Gear Games\\Path of Exile\\logs\\Client.txt',
    'C:\\Program Files\\Grinding Gear Games\\Path of Exile\\logs\\Client.txt',
    'D:\\Program Files (x86)\\Grinding Gear Games\\Path of Exile\\logs\\Client.txt',
    'E:\\Program Files (x86)\\Grinding Gear Games\\Path of Exile\\logs\\Client.txt',
  ];
  
  for (const logPath of steamPaths) {
    if (fs.existsSync(logPath)) {
      steamLogPath = logPath;
      writeRuntimeLog(`Found Steam Client.txt: ${logPath}`);
      break;
    }
  }
  
  for (const logPath of standalonePaths) {
    if (fs.existsSync(logPath)) {
      standaloneLogPath = logPath;
      writeRuntimeLog(`Found Standalone Client.txt: ${logPath}`);
      break;
    }
  }
  
  if (!steamLogPath && !standaloneLogPath) {
    writeRuntimeLog('ERROR: No Client.txt found!');
    dialog.showMessageBoxSync({
      type: 'error',
      title: 'No Client.txt Found',
      message: 'Could not find any Path of Exile Client.txt files',
      detail: 'Make sure Path of Exile is installed.',
      buttons: ['OK']
    });
    app.quit();
    return;
  }
  
  clientLogPath = standaloneLogPath || steamLogPath;
  
  writeRuntimeLog(`Steam Client.txt: ${steamLogPath || 'NOT FOUND'}`);
  writeRuntimeLog(`Standalone Client.txt: ${standaloneLogPath || 'NOT FOUND'}`);
  writeRuntimeLog(`Starting with: ${clientLogPath}`);
  writeRuntimeLog(`Will check process every 2 seconds and auto-switch`);

  const primaryDisplay = screen.getPrimaryDisplay();
  
  const { default: Store } = await import('electron-store');
  const store = new Store();
  const savedX = store.get('windowX', defaultSettings.windowX);
  const savedY = store.get('windowY', defaultSettings.windowY);
  const scale = store.get('scale', defaultSettings.scale);

  mainWindow = new BrowserWindow({
    width: Math.round(baseWidth * scale),
    height: Math.round(baseHeight * scale),
    x: savedX,
    y: savedY,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    movable: false, 
    resizable: false,
    icon: path.join(__dirname, 'assets', 'JungleValley.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadFile('index.html');
  mainWindow.setAlwaysOnTop(true, 'screen-saver');

  mapTracker = new MapTracker(mainWindow, logActivity, debug);
  labTracker = new LabTracker(mainWindow, logActivity, debug);
  actTracker = new ActTracker(mainWindow, logActivity, debug);
  starfallTracker = new StarfallTracker(mainWindow, logActivity, debug);

  // Set the starfallTracker reference in mapTracker so it can notify on new maps
  mapTracker.starfallTracker = starfallTracker;

  // Initialize update manager
  updateManager = new UpdateManager(mainWindow);

  const timerColor = store.get('timerColor', defaultSettings.timerColor);
  const mapColor = store.get('mapColor', defaultSettings.mapColor);

  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.send('update-timer-color', timerColor);
    mainWindow.webContents.send('update-map-color', mapColor);
    mainWindow.webContents.send('update-scale', scale);
    
    // Check for updates on startup (after 3 seconds delay)
    setTimeout(() => {
      if (updateManager) {
        updateManager.checkForUpdates().catch(err => {
          console.error('Failed to check for updates:', err);
        });
      }
    }, 3000);
  });

  mainWindow.on('close', (event) => {
    if (!app.isQuiting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  if (fs.existsSync(clientLogPath)) {
    lastProcessedPosition = fs.statSync(clientLogPath).size;
    isInitialRead = false;
  }
  
  setupLogWatcher();
}

function createSettingsWindow() {
  if (!settingsWindow) {
    settingsWindow = new BrowserWindow({
      width: 400,
      height: 350,
      frame: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: true,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false
      }
    });

    settingsWindow.loadFile('settings.html');

    settingsWindow.on('closed', () => {
      settingsWindow = null;
    });
  } else {
    settingsWindow.focus();
  }
}

ipcMain.on('toggle-window-movable', (event, enabled) => {
  if (mainWindow) {
    mainWindow.setFocusable(enabled);
    if (enabled) {
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
      mainWindow.webContents.send('enable-window-drag', true);
      if (settingsWindow) settingsWindow.setAlwaysOnTop(false);
    } else {
      const bounds = mainWindow.getBounds();
      saveWindowPosition(bounds.x, bounds.y);
      mainWindow.setFocusable(false);
      mainWindow.setAlwaysOnTop(true, 'screen-saver'); 
      mainWindow.webContents.send('enable-window-drag', false);
      if (settingsWindow) {
        settingsWindow.setAlwaysOnTop(true, 'screen-saver');
        settingsWindow.focus();
      }
    }
  }
});

ipcMain.on('window-drag-start', (event, { x, y }) => {
  if (mainWindow) {
    const bounds = mainWindow.getBounds();
    mainWindow.dragOffset = { x: x - bounds.x, y: y - bounds.y };
  }
});

ipcMain.on('window-drag-move', (event, { x, y }) => {
  if (mainWindow && mainWindow.dragOffset) {
    mainWindow.setPosition(x - mainWindow.dragOffset.x, y - mainWindow.dragOffset.y);
  }
});

async function saveWindowPosition(x, y) {
  const { default: Store } = await import('electron-store');
  const store = new Store();
  store.set('windowX', x);
  store.set('windowY', y);
}

ipcMain.on('save-settings', async (event, settings) => {
  const { default: Store } = await import('electron-store');
  const store = new Store();
  store.set('timerColor', settings.timerColor);
  store.set('mapColor', settings.mapColor);
  store.set('scale', settings.scale);

  if (mainWindow) {
    mainWindow.webContents.send('update-timer-color', settings.timerColor);
    mainWindow.webContents.send('update-map-color', settings.mapColor);
    mainWindow.webContents.send('update-scale', settings.scale);
    const newWidth = Math.round(baseWidth * settings.scale);
    const newHeight = Math.round(baseHeight * settings.scale);
    mainWindow.setContentSize(newWidth, newHeight);
  }
});

ipcMain.on('close-settings-window', () => {
  if (settingsWindow) settingsWindow.close();
});

ipcMain.handle('load-settings', async () => {
  const { default: Store } = await import('electron-store');
  const store = new Store();
  return {
    timerColor: store.get('timerColor', defaultSettings.timerColor),
    mapColor: store.get('mapColor', defaultSettings.mapColor),
    windowX: store.get('windowX', defaultSettings.windowX),
    windowY: store.get('windowY', defaultSettings.windowY),
    scale: store.get('scale', defaultSettings.scale)
  };
});

ipcMain.handle('reset-defaults', async () => {
  const { default: Store } = await import('electron-store');
  const store = new Store();
  store.set('timerColor', defaultSettings.timerColor);
  store.set('mapColor', defaultSettings.mapColor);
  store.set('windowX', defaultSettings.windowX);
  store.set('windowY', defaultSettings.windowY);
  store.set('scale', defaultSettings.scale);

  if (mainWindow) {
    mainWindow.setPosition(defaultSettings.windowX, defaultSettings.windowY);
    mainWindow.webContents.send('update-timer-color', defaultSettings.timerColor);
    mainWindow.webContents.send('update-map-color', defaultSettings.mapColor);
    mainWindow.webContents.send('update-scale', defaultSettings.scale);
    const newWidth = Math.round(baseWidth * defaultSettings.scale);
    const newHeight = Math.round(baseHeight * defaultSettings.scale);
    mainWindow.setContentSize(newWidth, newHeight);
  }
  return defaultSettings;
});

// Update-related IPC handlers
ipcMain.handle('check-for-updates', async () => {
  try {
    if (updateManager) {
      await updateManager.checkForUpdates();
      return updateManager.getUpdateInfo();
    }
    return { error: 'Update manager not initialized' };
  } catch (error) {
    return { error: error.message };
  }
});

ipcMain.handle('download-update', async () => {
  try {
    if (updateManager) {
      await updateManager.downloadUpdate();
      return { success: true };
    }
    return { error: 'Update manager not initialized' };
  } catch (error) {
    return { error: error.message };
  }
});

ipcMain.handle('install-update', async () => {
  if (updateManager) {
    updateManager.quitAndInstall();
  }
});

ipcMain.handle('get-app-version', async () => {
  return app.getVersion();
});

function loadMapCounts() {
  try {
    if (fs.existsSync(countsFilePath)) {
      persistentMapCounts = JSON.parse(fs.readFileSync(countsFilePath, 'utf8'));
    }
  } catch (err) { persistentMapCounts = {}; }
}

function saveMapCounts() {
  try {
    fs.writeFileSync(countsFilePath, JSON.stringify(persistentMapCounts, null, 2));
  } catch (err) { console.error('Failed to save map counts:', err); }
}

function writeSummaryLog() {
  try {
    let output = '';
    const dates = Object.keys(persistentMapCounts).sort((a, b) => new Date(a) - new Date(b));
    for (const date of dates) {
      output += `${date}\n`;
      const maps = persistentMapCounts[date];
      Object.keys(maps).sort().forEach(mapName => {
        // Special label for Starfall Craters
        if (mapName === 'Starfall Craters') {
          output += `Total Starfall Craters: ${maps[mapName]}\n`;
        } else {
          output += `Total ${mapName} Maps: ${maps[mapName]}\n`;
        }
      });
    }
    fs.writeFileSync(summaryLogPath, output, 'utf8');
  } catch (err) { console.error('Failed to write summary log:', err); }
}

app.whenReady().then(() => {
  logsDir = path.join(__dirname, 'logs');
  if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

  countsFilePath = path.join(logsDir, 'map-counts.json');
  summaryLogPath = path.join(logsDir, 'map-summary.txt');
  loadMapCounts();

  logActivity = function(message) {
    if (typeof message === 'string' && message.startsWith('[MAP] Started map:')) {
      try {
        const match = message.match(/\[MAP\] Started map: (.*) \(Total maps:/);
        if (match && match[1]) {
          const mapName = match[1].trim();
          const now = new Date();
          const summaryDateString = `${now.getMonth() + 1}/${now.getDate()}/${now.getFullYear()}`;
          if (!persistentMapCounts[summaryDateString]) persistentMapCounts[summaryDateString] = {};
          if (!persistentMapCounts[summaryDateString][mapName]) persistentMapCounts[summaryDateString][mapName] = 0;
          persistentMapCounts[summaryDateString][mapName]++;
        }
      } catch (err) {}
    }
    
    // Log Starfall Craters runs
    if (typeof message === 'string' && message.startsWith('[STARFALL] Started Starfall Craters')) {
      try {
        const now = new Date();
        const summaryDateString = `${now.getMonth() + 1}/${now.getDate()}/${now.getFullYear()}`;
        if (!persistentMapCounts[summaryDateString]) persistentMapCounts[summaryDateString] = {};
        if (!persistentMapCounts[summaryDateString]['Starfall Craters']) persistentMapCounts[summaryDateString]['Starfall Craters'] = 0;
        persistentMapCounts[summaryDateString]['Starfall Craters']++;
      } catch (err) {}
    }
  };

  createWindow();

  const trayIcon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'JungleValley.png'));
  tray = new Tray(trayIcon);

  tray.setToolTip('Path of Exile Timer');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Settings', click: () => createSettingsWindow() },
    { label: 'Quit', click: () => { app.isQuiting = true; app.quit(); } }
  ]));

  tray.on('click', () => {
    mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
  });

  ipcMain.on('open-settings', () => createSettingsWindow());
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  saveMapCounts();
  writeSummaryLog();
  if (logWatcher) clearInterval(logWatcher);
});