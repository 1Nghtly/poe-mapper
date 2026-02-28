class StarfallTracker {
  constructor(mainWindow, activityLogger, debug = true) {
    this.mainWindow = mainWindow;
    this.activityLogger = activityLogger || (() => {});
    this.debug = debug;
    
    // Starfall tracking state
    this.starfallRunning = false;
    this.starfallCount = 0;
    this.isInStarfall = false;
    this.lastStarfallDetectedTime = 0;
    this.starfallCooldownTime = 4000;
    
    // Track the last map seed to only count one Starfall per map
    this.lastMapSeed = null;
    this.starfallCountedForCurrentMap = false;
    
    // Starfall-specific timer state
    this.starfallStartTime = null;
    this.starfallPausedDuration = 0;
    this.starfallPauseStartTime = null;
    
    // Keywords
    this.starfallAreaName = 'SettlersBossFallenStar';
    this.enterHideoutKeyword = 'EnterHideout';
  }

  logDebug(message) {
    if (this.debug) {
      console.log(`[STARFALL] [${new Date().toISOString()}] ${message}`);
    }
  }

  startStarfallTimer() {
    this.logDebug('Starting Starfall timer');
    this.starfallStartTime = Date.now();
    this.starfallPausedDuration = 0;
    this.starfallPauseStartTime = null;
    this.mainWindow.webContents.send('start-starfall-timer');
  }

  pauseStarfallTimer() {
    if (this.starfallRunning) {
      this.logDebug('Pausing Starfall timer');
      this.starfallPauseStartTime = Date.now();
      this.mainWindow.webContents.send('pause-starfall-timer');
    }
  }

  resumeStarfallTimer() {
    if (this.starfallPauseStartTime) {
      this.logDebug('Resuming Starfall timer');
      this.starfallPausedDuration += Date.now() - this.starfallPauseStartTime;
      this.starfallPauseStartTime = null;
      this.mainWindow.webContents.send('resume-starfall-timer');
    }
  }

  stopStarfallTimer() {
    this.logDebug('Stopping Starfall timer');
    this.starfallRunning = false;
    this.starfallStartTime = null;
    this.starfallPausedDuration = 0;
    this.starfallPauseStartTime = null;
    this.mainWindow.webContents.send('stop-starfall-timer');
  }

  extractStarfallInfoFromGenerating(line) {
    const match = line.match(/Generating level (\d+) area "([^"]+)" with seed (\d+)/);
    if (match && match[2] === this.starfallAreaName) {
      this.logDebug(`Extracted Starfall info: level=${match[1]}, seed=${match[3]}`);
      return {
        level: match[1],
        area: match[2],
        seed: match[3]
      };
    }
    return null;
  }

  processStarfallGeneration(line) {
    if (!line.includes('Generating level')) return false;

    const starfallInfo = this.extractStarfallInfoFromGenerating(line);
    if (!starfallInfo) return false;

    const currentTime = Date.now();
    
    // If already in Starfall, just resume the timer (re-entry to same crater)
    if (this.isInStarfall) {
      if (!this.starfallRunning) {
        this.logDebug('Re-entering same Starfall crater - resuming timer');
        this.starfallRunning = true;
        this.resumeStarfallTimer();
      }
      return true;
    }
    
    // NEW Starfall encounter - only count if we haven't counted one for this map yet
    this.logDebug(`New Starfall run detected (already counted: ${this.starfallCountedForCurrentMap})`);
    
    // Only increment counter if this is the first Starfall in this map
    if (!this.starfallCountedForCurrentMap) {
      this.starfallCount++;
      this.starfallCountedForCurrentMap = true;
      this.activityLogger(`[STARFALL] Started Starfall Craters run (Total: ${this.starfallCount})`);
    } else {
      this.logDebug('Starfall already counted for this map - not incrementing');
    }
    
    this.lastStarfallDetectedTime = currentTime;
    this.isInStarfall = true;
    this.starfallRunning = true;
    
    // Don't update UI here - let main.js updateActiveTimer() handle it
    this.mainWindow.webContents.send('switch-to-starfall-timer');
    
    // Start the timer
    this.startStarfallTimer();
    
    return true;
  }

  processMapReturn(line) {
    // Check if we're returning to a map area after Starfall
    if (!line.includes('You have entered')) return false;
    
    if (!this.isInStarfall) return false;

    const mapNameMatch = line.match(/You have entered (.+)/);
    const enteredArea = mapNameMatch ? mapNameMatch[1].trim() : '';
    
    // Ignore if we're just entering Starfall Craters itself (the initial entry message)
    // The area name in "You have entered" might be different from the internal area name
    // Common patterns: contains "Starfall", "Crater", or similar
    if (enteredArea.toLowerCase().includes('starfall') || 
        enteredArea.toLowerCase().includes('crater')) {
      this.logDebug(`Initial Starfall entry detected, staying in Starfall: ${enteredArea}`);
      return false;
    }
    
    // If we're entering any other area, end the Starfall run
    this.logDebug(`Left Starfall, entered: ${enteredArea}`);
    
    // Log completion
    const elapsedTime = this.getStarfallElapsedTime();
    const minutes = Math.floor(elapsedTime / 60);
    const seconds = elapsedTime % 60;
    this.activityLogger(`[STARFALL] Completed Starfall Craters in ${minutes}m ${seconds}s`);
    
    // Stop the run
    this.starfallRunning = false;
    this.isInStarfall = false;
    this.stopStarfallTimer();
    
    // Reset the counter flag when returning to map (but keep it set so we don't count again in same map)
    // The flag will be reset when a NEW map starts
    
    // Don't consume the line - let map tracker handle the entry
    return false;
  }

  processHideoutEntry(line) {
    const isEnterHideoutKeyword = line.includes(this.enterHideoutKeyword);
    const isYouHaveEntered = line.includes('You have entered') && line.toLowerCase().includes('hideout');
    
    if (!isEnterHideoutKeyword && !isYouHaveEntered) return false;

    if (this.isInStarfall) {
      this.logDebug('Hideout entry detected - ending Starfall run');
      
      // Log completion
      const elapsedTime = this.getStarfallElapsedTime();
      const minutes = Math.floor(elapsedTime / 60);
      const seconds = elapsedTime % 60;
      this.activityLogger(`[STARFALL] Completed Starfall Craters in ${minutes}m ${seconds}s`);
      
      // Stop the run
      this.starfallRunning = false;
      this.isInStarfall = false;
      this.stopStarfallTimer();
      
      // Don't consume the line - let map tracker handle hideout too
      return false;
    }
    
    return false;
  }

  processLine(line) {
    this.logDebug(`Processing line: ${line.substring(0, 100)}...`);
    
    // Check for returning to map (must be first to catch exits from Starfall)
    if (this.processMapReturn(line)) {
      this.logDebug('Line consumed by processMapReturn');
      return false; // Don't consume, let map tracker process
    }
    
    // Check for Starfall generation
    if (this.processStarfallGeneration(line)) {
      this.logDebug('Line consumed by processStarfallGeneration');
      return true;
    }
    
    // Check for hideout entry (fallback if player portals out)
    if (this.processHideoutEntry(line)) {
      this.logDebug('Line consumed by processHideoutEntry');
      return false; // Don't consume, let map tracker process
    }
    
    this.logDebug('Line not consumed by Starfall tracker');
    return false;
  }

  // Getters
  getStarfallCount() {
    return this.starfallCount;
  }

  isStarfallRunning() {
    return this.starfallRunning;
  }

  isCurrentlyInStarfall() {
    return this.isInStarfall;
  }

  getStarfallElapsedTime() {
    if (!this.starfallStartTime) return 0;
    
    let elapsed = Date.now() - this.starfallStartTime - this.starfallPausedDuration;
    
    if (this.starfallPauseStartTime) {
      elapsed -= Date.now() - this.starfallPauseStartTime;
    }
    
    return Math.max(0, Math.floor(elapsed / 1000));
  }

  // Called by MapTracker when a new map starts
  onNewMapStarted(mapSeed) {
    this.logDebug(`New map started (seed: ${mapSeed}) - resetting Starfall counter flag`);
    this.starfallCountedForCurrentMap = false;
    this.lastMapSeed = mapSeed;
  }
}

module.exports = StarfallTracker;