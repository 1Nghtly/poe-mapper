class ActTracker {
  constructor(mainWindow, activityLogger, debug = true) {
    this.mainWindow = mainWindow;
    this.activityLogger = activityLogger || (() => {});
    this.debug = debug;
    
    // Act tracking state
    this.actRunning = false;
    this.lastAct = '';
    this.lastActSeed = '';
    this.actCount = 0;
    this.currentActNumber = 0;
    this.lastActDetectedTime = 0;
    this.actCooldownTime = 3000;
    this.pausedTime = 0;
    this.currentActArea = '';
    this.isActRun = false;
    
    // Session timer state
    this.sessionStartTime = null;
    this.sessionPausedDuration = 0;
    this.sessionPauseStartTime = null;
    this.sessionTimerRunning = false;
    
    // Keywords
    this.mapStartKeyword = 'You have entered';
    this.enterHideoutKeyword = 'EnterHideout';
    this.mapGeneratingKeyword = 'Generating level';
    
    // Known towns
    this.knownTowns = [
      "Lioneye's Watch",
      "The Forest Encampment",
      "The Sarn Encampment", 
      "Highgate",
      "Overseer's Tower",
      "The Bridge Encampment",
      "Oriath Docks",
      "Karui Shores",
      "Kingsmarch",
      "Menagerie"
    ];

    // Act area name mappings
    this.actAreaNames = {
      '1_1_2': 'The Coast',
      '1_1_3': 'The Tidal Island',
      '1_1_4': 'The Mud Flats',
      '1_1_5': 'The Fetid Pool',
      '1_1_6': 'The Submerged Passage',
      '1_1_7': 'The Flooded Depths',
      '1_1_8': 'The Ledge',
      '1_1_9': 'The Climb',
      '1_1_10': 'The Lower Prison',
      '1_1_11': 'The Upper Prison',
      '1_1_11_1': 'Brutus\' Chambers',
      '1_1_12': 'Prisoner\'s Gate',
      '1_1_13': 'The Ship Graveyard',
      '1_1_14': 'The Ship Graveyard Cave',
      '1_1_15': 'The Cavern of Wrath',
      '1_2_1': 'The Southern Forest',
      '1_2_2': 'The Old Fields',
      '1_2_3': 'The Crossroads',
      '1_2_4': 'The Broken Bridge',
      '1_2_5': 'The Fellshrine Ruins',
      '1_2_6': 'The Crypt',
      '1_2_7': 'The Chamber of Sins',
      '1_2_8': 'The Den',
      '1_2_9': 'The Riverways',
      '1_2_10': 'The Western Forest',
      '1_2_11': 'The Weaver\'s Chambers',
      '1_2_12': 'The Wetlands',
      '1_2_13': 'The Vaal Ruins',
      '1_2_14': 'The Northern Forest',
      '1_2_15': 'The Caverns',
      '1_2_16': 'The Ancient Pyramid'
    };
  }

  logDebug(message) {
    if (this.debug) {
      console.log(`[ACT] [${new Date().toISOString()}] ${message}`);
    }
  }

  isTownOrHideout(areaName) {
    return this.knownTowns.some(town => areaName.includes(town)) || 
           areaName.toLowerCase().includes('hideout');
  }

  extractActAreaFromGenerating(line) {
    const match = line.match(/Generating level \d+ area "([^"]+)" with seed (\d+)/);
    if (match) {
      this.logDebug(`Extracted area info: area=${match[1]}, seed=${match[2]}`);
      return {
        area: match[1],
        seed: match[2]
      };
    }
    this.logDebug(`Failed to extract area info from: ${line}`);
    return null;
  }

  isActArea(areaName) {
    if (!areaName) {
      this.logDebug(`isActArea: areaName is null/undefined`);
      return false;
    }
    
    const actPattern = /^\d+_\d+_\d+/;
    const isAct = actPattern.test(areaName);
    
    this.logDebug(`isActArea: Checking '${areaName}' against pattern - Result: ${isAct}`);
    return isAct;
  }

  getActAreaDisplayName(areaCode) {
    return this.actAreaNames[areaCode] || areaCode;
  }

  getCurrentAct(areaCode) {
    if (!areaCode) return 0;
    
    const parts = areaCode.split('_');
    if (parts.length >= 2) {
      return parseInt(parts[1], 10);
    }
    return 0;
  }

  getActDisplayName(actNumber) {
    return `Act ${actNumber}`;
  }

  startSessionTimer() {
    if (!this.sessionTimerRunning) {
      const isResuming = this.sessionPauseStartTime !== null;

      if (this.sessionStartTime === null) {
        this.sessionStartTime = Date.now();
        this.sessionPausedDuration = 0;
        this.logDebug('Session timer started for the first time');
      } else if (isResuming) {
        this.sessionPausedDuration += Date.now() - this.sessionPauseStartTime;
        this.sessionPauseStartTime = null;
        this.logDebug('Session timer resumed from pause');
      }
      this.sessionTimerRunning = true;

      if (isResuming) {
        this.mainWindow.webContents.send('resume-timer');
      } else {
        this.mainWindow.webContents.send('start-timer');
      }
    }
  }

  pauseSessionTimer() {
    if (this.sessionTimerRunning) {
      this.sessionPauseStartTime = Date.now();
      this.sessionTimerRunning = false;
      this.logDebug('Session timer paused');
      this.mainWindow.webContents.send('pause-timer');
    }
  }

  resumeSessionTimer() {
    if (!this.sessionTimerRunning && this.sessionPauseStartTime !== null) {
      this.sessionPausedDuration += Date.now() - this.sessionPauseStartTime;
      this.sessionPauseStartTime = null;
      this.sessionTimerRunning = true;
      this.logDebug('Session timer resumed');
      this.mainWindow.webContents.send('resume-timer');
    }
  }

  restoreActDisplay() {
    if (this.currentActNumber > 0) {
      const displayName = this.getActDisplayName(this.currentActNumber);
      this.logDebug(`Restoring act display: ${displayName}`);
      this.mainWindow.webContents.send('update-map-count', displayName);
      this.mainWindow.webContents.send('update-map-name', '');
      this.mainWindow.webContents.send('switch-to-session-timer');
      
      if (this.isActRun && !this.sessionTimerRunning) {
        this.logDebug('Restoring and resuming act session timer after lab exit');
        this.actRunning = true;
        this.resumeSessionTimer();
      }
    }
  }

  processActGeneration(line) {
    if (!line.includes(this.mapGeneratingKeyword)) return false;

    const actInfo = this.extractActAreaFromGenerating(line);
    const currentTime = Date.now();
    
    if (actInfo && this.isActArea(actInfo.area)) {
      this.logDebug(`Act generation detected: ${actInfo.area}`);
      
      // CRITICAL: Set these FIRST before any other logic
      this.isActRun = true;
      this.actRunning = true;
      this.currentActArea = actInfo.area;
      
      // Start/resume the session timer
      this.startSessionTimer();
      this.mainWindow.webContents.send('switch-to-session-timer');
      
      const isDifferentArea = actInfo.area !== this.lastAct;
      const isDifferentSeed = actInfo.seed !== this.lastActSeed;
      const cooldownPassed = currentTime - this.lastActDetectedTime > this.actCooldownTime;
      
      if ((isDifferentArea || (isDifferentSeed && cooldownPassed))) {
        this.logDebug(`New act area logic triggered for: ${actInfo.area}`);
        const newActNumber = this.getCurrentAct(actInfo.area);
        
        if (newActNumber > 0) {
          this.currentActNumber = newActNumber;
          this.logDebug(`Current act number updated to: ${this.currentActNumber}`);
        }
        
        this.lastAct = actInfo.area;
        this.lastActSeed = actInfo.seed;
        this.lastActDetectedTime = currentTime;
      } 

      // Always update the display when in an act area
      const displayName = this.getActDisplayName(this.currentActNumber);
      this.logDebug(`Sending display update: ${displayName}`);
      this.mainWindow.webContents.send('update-map-count', displayName);
      this.mainWindow.webContents.send('update-map-name', '');

      return true;
    }
    
    return false;
  }

  processAreaEntry(line) {
    if (!line.includes(this.mapStartKeyword)) return false;

    const areaNameMatch = line.match(/You have entered (.+)/);
    const enteredArea = areaNameMatch ? areaNameMatch[1].trim() : 'Unknown';
    this.logDebug(`Detected area entry: ${enteredArea}`);

    // CRITICAL: Check if entering lab or map and pause session timer
    if (enteredArea.includes('Labyrinth') || enteredArea.includes("Aspirants' Plaza") || 
        enteredArea.startsWith('Map') || enteredArea.includes('Synthesis_') || 
        enteredArea.includes('PinnacleBoss')) {
      this.logDebug(`Entering lab/map area: ${enteredArea} - pausing session timer`);
      if (this.sessionTimerRunning) {
        this.pauseSessionTimer();
      }
      return false; // Let other trackers handle it
    }

    if (enteredArea.toLowerCase().includes('hideout')) {
      this.logDebug(`Entering hideout: ${enteredArea} - pausing act state and session timer`);
      
      if (this.actRunning) {
        this.actRunning = false;
        this.pausedTime = Date.now();
      }
      
      this.pauseSessionTimer();
      this.isActRun = false;
      this.currentActArea = '';
      
      this.logDebug('Act state and session timer paused due to hideout entry');
      return true;
    }
    
    if (this.isTownOrHideout(enteredArea) && !enteredArea.toLowerCase().includes('hideout')) {
      this.logDebug(`Entering town during act progression: ${enteredArea} - keeping session timer running`);
      
      if (this.actRunning) {
        this.actRunning = false;
        this.pausedTime = Date.now();
      }
      
      this.logDebug('Act running state paused, but session timer continues for town visit');
      return true;
    }

    if (this.isActRun && !this.actRunning) {
      this.logDebug(`Resuming act timer via 'You have entered': ${enteredArea}`);
      this.actRunning = true;
      this.restoreActDisplay();
    }

    return false;
  }

  processHideoutEntry(line) {
    const isEnterHideoutKeyword = line.includes(this.enterHideoutKeyword);
    const isHideoutAreaEntry = line.includes(this.mapStartKeyword) && 
                               line.toLowerCase().includes('hideout');
    
    if (!isEnterHideoutKeyword && !isHideoutAreaEntry) return false;

    this.logDebug(`Hideout entry detected - HARD STOPPING session timer completely`);
    
    if (this.actRunning) {
      this.actRunning = false;
      this.pausedTime = Date.now();
    }
    
    this.stopSessionTimer();
    this.isActRun = false;
    this.currentActArea = '';
    
    this.logDebug('Session timer HARD STOPPED and all act state cleared for hideout');
    
    return false;
  }

  processLine(line) {
    // CRITICAL FIX: Check for act generation FIRST, before checking for maps/labs
    if (line.includes(this.mapGeneratingKeyword)) {
      const areaInfo = this.extractActAreaFromGenerating(line);
      if (areaInfo) {
        // Check if it's an ACT area first
        if (this.isActArea(areaInfo.area)) {
          this.logDebug('[ACT] Act area detected - processing with act tracker');
          return this.processActGeneration(line);
        }
        
        // Only if it's NOT an act area, check if it's map/lab and pause
        if (areaInfo.area.startsWith('Map') || areaInfo.area.includes('Labyrinth') || 
            areaInfo.area.includes('Synthesis_') || areaInfo.area.includes('PinnacleBoss')) {
          this.logDebug('[ACT] Detected map or lab area - PAUSING session timer.');
          this.pauseSessionTimer();
          return false;
        }
      }
    }
    
    if (this.processAreaEntry(line)) {
      return true;
    }
    
    if (this.processHideoutEntry(line)) {
      return false;
    }
    
    return false;
  }

  stopSessionTimer() {
    if (this.sessionTimerRunning || this.sessionStartTime) {
      this.logDebug('Session timer HARD STOPPED');
      this.sessionTimerRunning = false;
      this.sessionStartTime = null;
      this.sessionPausedDuration = 0;
      this.sessionPauseStartTime = null;
      this.mainWindow.webContents.send('stop-session-timer');
    }
  }

  getActCount() {
    return this.currentActNumber;
  }

  isActRunning() {
    return this.actRunning;
  }

  isCurrentlyInAct() {
    return this.isActRun;
  }

  getCurrentActArea() {
    return this.currentActArea;
  }

  isSessionTimerRunning() {
    return this.sessionTimerRunning;
  }

  getSessionStartTime() {
    return this.sessionStartTime;
  }
}

module.exports = ActTracker;