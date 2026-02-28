class LabTracker {
  // --- MODIFICATION: Update constructor ---
  constructor(mainWindow, activityLogger, debug = true) {
    this.mainWindow = mainWindow;
    this.activityLogger = activityLogger || (() => {}); // Store the logger
    this.debug = debug;
    // --- END MODIFICATION ---
    
    // Lab tracking state
    this.labRunCount = 0;
    this.isLabRun = false;
    this.labCompleted = false;
    this.labRunning = false;
    this.lastLabDetectedTime = 0;
    this.labCooldown = 10000;
    this.pausedTime = 0;
    this.currentLabArea = '';
    this.lastLabSeed = '';
    
    // Lab-specific timer state
    this.labStartTime = null;
    this.labPausedDuration = 0;
    this.labPauseStartTime = null;
    
    // Keywords
    this.mapStartKeyword = 'You have entered';
    this.enterHideoutKeyword = 'EnterHideout';
    this.mapGeneratingKeyword = 'Generating level';
    
    // Izaro death quotes
    this.deathQuotes = [
      "You are free!",
      "I die for the Empire!",
      "Delight in your gilded dungeon, ascendant.",
      "Triumphant at last!",
      "Your destination is more dangerous than the journey, ascendant.",
      "The trap of tyranny is inescapable."
    ];

    // Known towns for resetting lab state (removed Aspirants' Plaza as it's lab entrance)
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
  }

  logDebug(message) {
    if (this.debug) {
      console.log(`[LAB] [${new Date().toISOString()}] ${message}`);
    }
  }

  isTownOrHideout(mapName) {
    return this.knownTowns.some(town => mapName.includes(town)) || 
           mapName.toLowerCase().includes('hideout');
  }

  isAspirantsPlaza(mapName) {
    return mapName && mapName.includes("Aspirants' Plaza");
  }

  extractLabAreaFromGenerating(line) {
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

  isLabyrinthArea(areaName) {
    return areaName && (areaName.includes('Labyrinth') || areaName.includes('_Labyrinth_'));
  }

  cleanLabAreaName(labAreaName) {
    // Handle different labyrinth area name formats
    if (labAreaName.includes('_Labyrinth_')) {
      // Format like "1_Labyrinth_OH_straight" - just return "Labyrinth"
      return 'Labyrinth';
    }
    if (labAreaName.startsWith('Labyrinth*')) {
      return labAreaName.replace('Labyrinth*', '').replace(/([A-Z])/g, ' $1').trim();
    }
    if (labAreaName.startsWith('Labyrinth')) {
      return labAreaName.replace('Labyrinth', '').replace(/([A-Z])/g, ' $1').trim();
    }
    return 'Labyrinth';
  }

  isIzaroDeathQuote(line) {
    return this.deathQuotes.some(quote => line.includes(quote));
  }

  startLabTimer() {
    this.labStartTime = Date.now();
    this.labPausedDuration = 0;
    this.labPauseStartTime = null;
    this.logDebug('Lab timer started');
    // Send lab-specific timer start event
    this.mainWindow.webContents.send('start-lab-timer');
  }

  pauseLabTimer() {
    if (this.labStartTime && !this.labPauseStartTime) {
      this.labPauseStartTime = Date.now();
      this.logDebug('Lab timer paused');
      this.mainWindow.webContents.send('pause-lab-timer');
    }
  }

  resumeLabTimer() {
    if (this.labPauseStartTime) {
      this.labPausedDuration += Date.now() - this.mapPauseStartTime;
      this.labPauseStartTime = null;
      this.logDebug('Lab timer resumed');
      this.mainWindow.webContents.send('resume-lab-timer');
    }
  }

  stopLabTimer() {
    this.logDebug('Lab timer stopped');
    this.mainWindow.webContents.send('stop-lab-timer');
  }

  processLabGeneration(line) {
    if (!line.includes(this.mapGeneratingKeyword)) return false;

    this.logDebug(`LAB: Found generating line: ${line}`);
    const labInfo = this.extractLabAreaFromGenerating(line);
    const currentTime = Date.now();
    
    if (labInfo && this.isLabyrinthArea(labInfo.area)) {
      this.logDebug(`LAB: Lab generation detected: ${labInfo.area} with seed ${labInfo.seed}`);
      this.logDebug(`LAB: Current state before processing - isLabRun: ${this.isLabRun}, labRunning: ${this.labRunning}, lastLabSeed: ${this.lastLabSeed}`);
      
      this.currentLabArea = labInfo.area;
      
      const isDifferentLab = (labInfo.seed !== this.lastLabSeed) || (labInfo.area !== this.currentLabArea);
      
      this.logDebug(`LAB: isDifferentLab: ${isDifferentLab}, cooldown check: ${currentTime - this.lastLabDetectedTime > this.labCooldown}`);
      
      if (isDifferentLab && currentTime - this.lastLabDetectedTime > this.labCooldown) {
        this.logDebug(`LAB: New lab run detected: ${labInfo.area} (seed: ${labInfo.seed})`);
        
        // Start new lab run but DON'T increment counter yet
        this.isLabRun = true;
        this.labCompleted = false;
        this.lastLabSeed = labInfo.seed;
        this.lastLabDetectedTime = currentTime;

        // --- MODIFICATION: Log activity ---
        // Log +1 because counter only updates on completion
        this.activityLogger(`[LAB] Started lab run. (Total runs: ${this.labRunCount + 1})`);
        // --- END MODIFICATION ---
        
        // Update UI - don't show map name for lab runs, just the counter
        this.logDebug(`LAB: Sending updates: counter="Lab runs: ${this.labRunCount}", clearing map name`);
        this.mainWindow.webContents.send('update-map-count', `Lab runs: ${this.labRunCount}`);
        this.mainWindow.webContents.send('update-map-name', ''); // Clear map name for lab runs
        
        // Start lab-specific timer if not running
        if (!this.labRunning) {
          this.logDebug('LAB: Starting lab timer - NEW LAB RUN');
          this.labRunning = true;
          this.pausedTime = 0;
          this.startLabTimer();
        }
      } else if (labInfo.area === this.currentLabArea && labInfo.seed === this.lastLabSeed) {
        // Same lab area, just update the last detected time
        this.logDebug(`LAB: Same lab area detected, updating time only. labRunning: ${this.labRunning}`);
        this.lastLabDetectedTime = currentTime;
        
        // Resume timer if not running (for re-entering same lab area)
        if (!this.labRunning && this.isLabRun) {
          this.logDebug('LAB: Resuming lab timer for same area');
          this.labRunning = true;
          this.resumeLabTimer();
        }
      } else {
        // Different lab room in same run (like boss room) - don't increment counter
        this.logDebug(`LAB: Different lab room in same run: ${labInfo.area}`);
        this.currentLabArea = labInfo.area;
        this.lastLabDetectedTime = currentTime;
        
        // Resume timer if not running
        if (!this.labRunning && this.isLabRun) {
          this.logDebug('LAB: Resuming lab timer for different room in same run');
          this.labRunning = true;
          this.resumeLabTimer();
        }
      }
      return true;
    }
    this.logDebug(`LAB: Not a labyrinth area: ${labInfo ? labInfo.area : 'null'}`);
    return false;
  }

  processIzaroDefeat(line) {
    if (!this.isIzaroDeathQuote(line) || !this.isLabRun || this.labCompleted) {
      return false;
    }

    this.logDebug('Lab run completed - Izaro defeated');
    
    // NOW increment the counter when Izaro is actually defeated
    this.labRunCount++;
    this.labCompleted = true;

    // --- MODIFICATION: Log activity ---
    this.activityLogger(`[LAB] Lab run finished. (Total runs: ${this.labRunCount})`);
    // --- END MODIFICATION ---
    
    // Update the UI with the new counter
    this.mainWindow.webContents.send('update-map-count', `Lab runs: ${this.labRunCount}`);
    this.lastLabDetectedTime = Date.now();
    
    if (this.labRunning) {
      this.labRunning = false;
      this.pausedTime = Date.now();
      this.pauseLabTimer();
    }
    return true;
  }

  processAreaEntry(line) {
    if (!line.includes(this.mapStartKeyword)) return false;

    const mapNameMatch = line.match(/You have entered (.+)/);
    const enteredArea = mapNameMatch ? mapNameMatch[1].trim() : 'Unknown';
    this.logDebug(`LAB: Detected area entry: ${enteredArea}`);

    // Special handling for Aspirants' Plaza - it's the lab entrance, not a town
    if (this.isAspirantsPlaza(enteredArea)) {
      this.logDebug(`LAB: Entering Aspirants' Plaza (lab entrance) - not resetting lab state, not starting timer`);
      this.logDebug(`LAB: Current state - isLabRun: ${this.isLabRun}, labRunning: ${this.labRunning}, labCompleted: ${this.labCompleted}`);
      
      if (this.labRunning) {
        this.logDebug('LAB: Pausing lab timer due to Aspirants Plaza entry');
        this.labRunning = false;
        this.pausedTime = Date.now();
        this.pauseLabTimer();
      } else {
        this.logDebug('LAB: No lab timer running, nothing to pause');
      }
      this.logDebug('LAB: Consuming Aspirants Plaza event, returning true');
      return true; // Consume this event to prevent map tracker from handling it
    }

    // Check if entering a town or hideout (resets lab state)
    if (this.isTownOrHideout(enteredArea)) {
      this.logDebug(`LAB: Entering town/hideout: ${enteredArea} - resetting lab state`);
      if (this.labRunning) {
        this.logDebug('LAB: Stopping lab timer due to town or hideout entry');

        // --- MODIFICATION: Log activity (aborted run) ---
        if (this.isLabRun && !this.labCompleted) {
          this.activityLogger(`[LAB] Lab run finished (aborted to town/hideout). (Total runs: ${this.labRunCount})`);
        }
        // --- END MODIFICATION ---

        this.labRunning = false;
        this.pausedTime = Date.now();
        this.stopLabTimer();
      }
      // Reset all lab state when entering towns/hideout
      this.isLabRun = false;
      this.labCompleted = false;
      this.currentLabArea = '';
      this.lastLabSeed = '';
      this.labStartTime = null;
      this.labPausedDuration = 0;
      this.labPauseStartTime = null;
      this.logDebug('LAB: NOT consuming town/hideout event, returning false');
      return false; // *** THIS IS THE FIX ***: Was 'true', now 'false'
    }
    this.logDebug('LAB: Not handling this area entry, returning false');
    return false;
  }

  processHideoutEntry(line) {
    const isEnterHideoutKeyword = line.includes(this.enterHideoutKeyword);
    const isHideoutAreaEntry = line.includes(this.mapStartKeyword) && 
                               line.toLowerCase().includes('hideout');
    
    if (!isEnterHideoutKeyword && !isHideoutAreaEntry) return false;

    if (this.labRunning) {
      this.logDebug('Stopping lab timer due to hideout entry');

      // --- MODIFICATION: Log activity (aborted run) ---
      if (this.isLabRun && !this.labCompleted) {
        this.activityLogger(`[LAB] Lab run finished (aborted to hideout). (Total runs: ${this.labRunCount})`);
      }
      // --- END MODIFICATION ---

      this.labRunning = false;
      this.pausedTime = Date.now();
      this.stopLabTimer();
    }
    // Reset lab state when entering hideout
    this.isLabRun = false;
    this.labCompleted = false;
    this.currentLabArea = '';
    this.lastLabSeed = '';
    this.labStartTime = null;
    this.labPausedDuration = 0;
    this.labPauseStartTime = null;
    return false; // Let other trackers also handle this
  }

  processLine(line) {
    // Process lab-related lines
    if (this.processLabGeneration(line)) return true;
    if (this.processIzaroDefeat(line)) return true;
    if (this.processAreaEntry(line)) return true;
    if (this.processHideoutEntry(line)) return false; // Don't consume this event
    return false;
  }

  // Getters for state
  getLabRunCount() {
    return this.labRunCount;
  }

  isLabRunning() {
    return this.labRunning;
  }

  isCurrentlyInLab() {
    return this.isLabRun;
  }

  getCurrentLabArea() {
    return this.currentLabArea;
  }

  getLabElapsedTime() {
    if (!this.labStartTime) return 0;
    
    let elapsed = Date.now() - this.labStartTime - this.labPausedDuration;
    
    if (this.labPauseStartTime) {
      elapsed -= Date.now() - this.labPauseStartTime;
    }
    
    return Math.max(0, Math.floor(elapsed / 1000));
  }
}

module.exports = LabTracker;