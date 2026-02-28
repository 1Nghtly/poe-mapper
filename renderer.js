const timerElement = document.getElementById('timer');
const mapNameElement = document.getElementById('mapName');
const mapCountElement = document.getElementById('mapCount');
const settingsIcon = document.getElementById('settings-icon');
const container = document.getElementById('container');

// Session timer state (for acts)
let sessionStartTime;
let sessionRunning = false;
let sessionPauseStartTime = null;
let sessionPausedDuration = 0;

// Lab timer state (separate from session timer)
let labStartTime = null;
let labRunning = false;
let labPauseStartTime = null;
let labPausedDuration = 0;

// Map timer state (separate from session and lab timers)
let mapStartTime = null;
let mapRunning = false;
let mapPauseStartTime = null;
let mapPausedDuration = 0;

// Starfall timer state (separate from session, lab, and map timers)
let starfallStartTime = null;
let starfallRunning = false;
let starfallPauseStartTime = null;
let starfallPausedDuration = 0;

// Current timer mode
let currentTimerMode = 'session'; // 'session', 'lab', 'map', or 'starfall'

let isDraggable = false;
let isDragging = false;

// Function to open settings window by sending an IPC message
settingsIcon.addEventListener('click', (e) => {
  // Prevent drag when clicking settings
  e.stopPropagation();
  if (window.electron && window.electron.ipcRenderer) {
    window.electron.ipcRenderer.send('open-settings');
  }
});

// Drag functionality
let dragStarted = false;

container.addEventListener('mousedown', (e) => {
  if (!isDraggable || e.target === settingsIcon) return;
  
  isDragging = true;
  dragStarted = false;
  
  // Send initial drag position to main process
  if (window.electron && window.electron.ipcRenderer) {
    window.electron.ipcRenderer.send('window-drag-start', {
      x: e.screenX,
      y: e.screenY
    });
  }
});

document.addEventListener('mousemove', (e) => {
  if (!isDragging || !isDraggable) return;
  
  if (!dragStarted) {
    dragStarted = true;
    document.body.style.cursor = 'grabbing';
  }
  
  // Send drag move position to main process
  if (window.electron && window.electron.ipcRenderer) {
    window.electron.ipcRenderer.send('window-drag-move', {
      x: e.screenX,
      y: e.screenY
    });
  }
});

document.addEventListener('mouseup', () => {
  if (isDragging) {
    isDragging = false;
    dragStarted = false;
    document.body.style.cursor = 'default';
  }
});

// Timer update function
function updateTimer() {
  if (currentTimerMode === 'lab' && labRunning) {
    // Update lab timer
    let elapsedTime = Math.floor((Date.now() - labStartTime - labPausedDuration) / 1000);
    if (labPauseStartTime) {
      elapsedTime -= Math.floor((Date.now() - labPauseStartTime) / 1000);
    }
    elapsedTime = Math.max(0, elapsedTime);
    
    const hours = String(Math.floor(elapsedTime / 3600)).padStart(2, '0');
    const minutes = String(Math.floor((elapsedTime % 3600) / 60)).padStart(2, '0');
    const seconds = String(elapsedTime % 60).padStart(2, '0');
    timerElement.textContent = `${hours}:${minutes}:${seconds}`;
  } else if (currentTimerMode === 'starfall' && starfallRunning) {
    // Update starfall timer
    let elapsedTime = Math.floor((Date.now() - starfallStartTime - starfallPausedDuration) / 1000);
    if (starfallPauseStartTime) {
      elapsedTime -= Math.floor((Date.now() - starfallPauseStartTime) / 1000);
    }
    elapsedTime = Math.max(0, elapsedTime);
    
    const hours = String(Math.floor(elapsedTime / 3600)).padStart(2, '0');
    const minutes = String(Math.floor((elapsedTime % 3600) / 60)).padStart(2, '0');
    const seconds = String(elapsedTime % 60).padStart(2, '0');
    timerElement.textContent = `${hours}:${minutes}:${seconds}`;
  } else if (currentTimerMode === 'map' && mapRunning) {
    // Update map timer
    let elapsedTime = Math.floor((Date.now() - mapStartTime - mapPausedDuration) / 1000);
    if (mapPauseStartTime) {
      elapsedTime -= Math.floor((Date.now() - mapPauseStartTime) / 1000);
    }
    elapsedTime = Math.max(0, elapsedTime);
    
    const hours = String(Math.floor(elapsedTime / 3600)).padStart(2, '0');
    const minutes = String(Math.floor((elapsedTime % 3600) / 60)).padStart(2, '0');
    const seconds = String(elapsedTime % 60).padStart(2, '0');
    timerElement.textContent = `${hours}:${minutes}:${seconds}`;
  } else if (currentTimerMode === 'session' && sessionRunning) {
    // Update session timer
    let elapsedTime = Math.floor((Date.now() - sessionStartTime - sessionPausedDuration) / 1000);
    if (sessionPauseStartTime) {
      elapsedTime -= Math.floor((Date.now() - sessionPauseStartTime) / 1000);
    }
    elapsedTime = Math.max(0, elapsedTime);
    
    const hours = String(Math.floor(elapsedTime / 3600)).padStart(2, '0');
    const minutes = String(Math.floor((elapsedTime % 3600) / 60)).padStart(2, '0');
    const seconds = String(elapsedTime % 60).padStart(2, '0');
    timerElement.textContent = `${hours}:${minutes}:${seconds}`;
  }
  requestAnimationFrame(updateTimer);
}

if (window.electron && window.electron.ipcRenderer) {
  const ipcRenderer = window.electron.ipcRenderer;

  // Session timer events (for acts)
  ipcRenderer.on('start-timer', () => {
    console.log('Session timer start event received');
    currentTimerMode = 'session';
    if (!sessionRunning) {
      sessionStartTime = Date.now();
      sessionPausedDuration = 0;
      sessionRunning = true;
      console.log('Session timer started');
    }
  });

  ipcRenderer.on('resume-timer', () => {
    console.log('Session timer resume event received');
    currentTimerMode = 'session';
    if (!sessionRunning && sessionPauseStartTime) {
      sessionPausedDuration += Date.now() - sessionPauseStartTime;
      sessionRunning = true;
      sessionPauseStartTime = null;
      console.log('Session timer resumed');
    } else if (!sessionRunning) {
      // If we don't have a pause start time, just resume with current state
      sessionRunning = true;
      console.log('Session timer resumed (no pause start time)');
    }
  });

  ipcRenderer.on('pause-timer', () => {
    console.log('Session timer pause event received');
    if (sessionRunning && currentTimerMode === 'session') {
      sessionPauseStartTime = Date.now();
      sessionRunning = false;
      console.log('Session timer paused');
    }
  });

  ipcRenderer.on('reset-timer', () => {
    console.log('Session timer reset event received');
    currentTimerMode = 'session';
    sessionStartTime = Date.now();
    sessionPausedDuration = 0;
    sessionRunning = true;
    console.log('Session timer reset');
  });

  // Map timer events (separate from session and lab timers)
  ipcRenderer.on('start-map-timer', () => {
    console.log('Map timer start event received');
    currentTimerMode = 'map';
    mapStartTime = Date.now();
    mapPausedDuration = 0;
    mapPauseStartTime = null;
    mapRunning = true;
    console.log('Map timer started');
  });

  ipcRenderer.on('resume-map-timer', () => {
    console.log('Map timer resume event received');
    currentTimerMode = 'map';
    if (mapPauseStartTime) {
      mapPausedDuration += Date.now() - mapPauseStartTime;
      mapPauseStartTime = null;
      mapRunning = true;
      console.log('Map timer resumed');
    }
  });

  ipcRenderer.on('pause-map-timer', () => {
    console.log('Map timer pause event received');
    if (mapRunning && currentTimerMode === 'map') {
      mapPauseStartTime = Date.now();
      mapRunning = false;
      console.log('Map timer paused');
    }
  });

ipcRenderer.on('stop-map-timer', () => {
    console.log('Map timer stop event received');
    mapRunning = false;
    mapStartTime = null;
    mapPausedDuration = 0;
    mapPauseStartTime = null;
    // CRITICAL: If we're in map timer mode, switch away from it to prevent phantom updates
    if (currentTimerMode === 'map') {
      console.log('Switching away from map timer mode after stop');
      currentTimerMode = 'session'; // Default back to session
    }
    console.log('Map timer stopped and mode switched if necessary');
  });

  // NEW EVENT: Force switch to map timer mode
  ipcRenderer.on('switch-to-map-timer', () => {
    console.log('Force switch to map timer mode');
    currentTimerMode = 'map';
    
    // If we have a map timer that should be running, resume it
    if (mapStartTime && !mapRunning) {
      console.log('Resuming map timer during mode switch');
      mapRunning = true;
      if (mapPauseStartTime) {
        mapPausedDuration += Date.now() - mapPauseStartTime;
        mapPauseStartTime = null;
      }
    }
  });

  // Lab timer events (separate from session timer)
  ipcRenderer.on('start-lab-timer', () => {
    console.log('Lab timer start event received');
    currentTimerMode = 'lab';
    labStartTime = Date.now();
    labPausedDuration = 0;
    labPauseStartTime = null;
    labRunning = true;
    console.log('Lab timer started');
  });

  ipcRenderer.on('resume-lab-timer', () => {
    console.log('Lab timer resume event received');
    currentTimerMode = 'lab';
    if (labPauseStartTime) {
      labPausedDuration += Date.now() - labPauseStartTime;
      labPauseStartTime = null;
      labRunning = true;
      console.log('Lab timer resumed');
    }
  });

  ipcRenderer.on('pause-lab-timer', () => {
    console.log('Lab timer pause event received');
    if (labRunning && currentTimerMode === 'lab') {
      labPauseStartTime = Date.now();
      labRunning = false;
      console.log('Lab timer paused');
    }
  });

  ipcRenderer.on('stop-lab-timer', () => {
    console.log('Lab timer stop event received - switching back to session mode');
    labRunning = false;
    labStartTime = null;
    labPausedDuration = 0;
    labPauseStartTime = null;
    // CRITICAL FIX: Switch back to session timer and ensure it resumes if it should be running
    currentTimerMode = 'session';
    
    // Check if we should resume the session timer
    if (sessionStartTime && !sessionRunning) {
      console.log('Resuming session timer after lab completion');
      sessionRunning = true;
      if (sessionPauseStartTime) {
        sessionPausedDuration += Date.now() - sessionPauseStartTime;
        sessionPauseStartTime = null;
      }
    }
    console.log('Switched back to session timer mode');
  });

  // NEW EVENT: Force switch to session timer mode (for when returning to acts after lab)
  ipcRenderer.on('switch-to-session-timer', () => {
    console.log('Force switch to session timer mode');
    currentTimerMode = 'session';
    
    // If we have a session timer that should be running, resume it
    if (sessionStartTime && !sessionRunning) {
      console.log('Resuming session timer during mode switch');
      sessionRunning = true;
      if (sessionPauseStartTime) {
        sessionPausedDuration += Date.now() - sessionPauseStartTime;
        sessionPauseStartTime = null;
      }
    }
  });

  // Starfall timer events (separate from session, lab, and map timers)
  ipcRenderer.on('start-starfall-timer', () => {
    console.log('Starfall timer start event received');
    currentTimerMode = 'starfall';
    starfallStartTime = Date.now();
    starfallPausedDuration = 0;
    starfallPauseStartTime = null;
    starfallRunning = true;
    console.log('Starfall timer started');
  });

  ipcRenderer.on('resume-starfall-timer', () => {
    console.log('Starfall timer resume event received');
    currentTimerMode = 'starfall';
    if (starfallPauseStartTime) {
      starfallPausedDuration += Date.now() - starfallPauseStartTime;
      starfallPauseStartTime = null;
      starfallRunning = true;
      console.log('Starfall timer resumed');
    }
  });

  ipcRenderer.on('pause-starfall-timer', () => {
    console.log('Starfall timer pause event received');
    if (starfallRunning && currentTimerMode === 'starfall') {
      starfallPauseStartTime = Date.now();
      starfallRunning = false;
      console.log('Starfall timer paused');
    }
  });

  ipcRenderer.on('stop-starfall-timer', () => {
    console.log('Starfall timer stop event received');
    starfallRunning = false;
    starfallStartTime = null;
    starfallPausedDuration = 0;
    starfallPauseStartTime = null;
    // Switch away from starfall timer mode after stop
    if (currentTimerMode === 'starfall') {
      console.log('Switching away from starfall timer mode after stop');
      currentTimerMode = 'session'; // Default back to session
    }
    console.log('Starfall timer stopped and mode switched if necessary');
  });

  // NEW EVENT: Force switch to starfall timer mode
  ipcRenderer.on('switch-to-starfall-timer', () => {
    console.log('Force switch to starfall timer mode');
    currentTimerMode = 'starfall';
    
    // If we have a starfall timer that should be running, resume it
    if (starfallStartTime && !starfallRunning) {
      console.log('Resuming starfall timer during mode switch');
      starfallRunning = true;
      if (starfallPauseStartTime) {
        starfallPausedDuration += Date.now() - starfallPauseStartTime;
        starfallPauseStartTime = null;
      }
    }
  });

    ipcRenderer.on('stop-all-timers', () => {
    console.log('STOP ALL TIMERS event received');
    
    // Pause all running flags
    sessionRunning = false;
    mapRunning = false;
    labRunning = false;
    starfallRunning = false;
    
    // Set pause start times to correctly calculate paused duration if resumed
    if (sessionStartTime) sessionPauseStartTime = Date.now();
    if (mapStartTime) mapPauseStartTime = Date.now();
    if (labStartTime) labPauseStartTime = Date.now();
    if (starfallStartTime) starfallPauseStartTime = Date.now();
    
    // Reset the displayed timer text to a neutral state
    timerElement.textContent = '00:00:00';
    
    console.log('All timers paused.');
  });

  ipcRenderer.on('update-map-name', (event, mapName) => {
    mapNameElement.textContent = mapName.endsWith('.') ? mapName.slice(0, -1) : mapName;
  });

  ipcRenderer.on('update-map-count', (event, mapCount) => {
    mapCountElement.textContent = mapCount;
  });

  // Listen for color updates from the settings window
  ipcRenderer.on('update-timer-color', (event, color) => {
    timerElement.style.color = color;
  });

  ipcRenderer.on('update-map-color', (event, color) => {
    mapNameElement.style.color = color;
    mapCountElement.style.color = color; // Optional: change map count color too
  });

  // Listen for drag enable/disable
  ipcRenderer.on('enable-window-drag', (event, enabled) => {
    isDraggable = enabled;
    if (enabled) {
      container.style.cursor = 'grab';
      document.body.style.userSelect = 'none'; // Prevent text selection while dragging
    } else {
      container.style.cursor = 'default';
      document.body.style.userSelect = 'auto';
      isDragging = false;
      document.body.style.cursor = 'default';
    }
  });

  // Listen for scale updates
  ipcRenderer.on('update-scale', (event, scale) => {
    container.style.transform = `scale(${scale})`;
  });
}

updateTimer();