class MapTracker {
  // --- MODIFICATION: Update constructor ---
  constructor(mainWindow, activityLogger, debug = true, starfallTracker = null) {
    this.mainWindow = mainWindow;
    this.activityLogger = activityLogger || (() => {}); // Store the logger
    this.debug = debug;
    this.starfallTracker = starfallTracker; // Reference to StarfallTracker
    // --- END MODIFICATION ---
    
    // Map tracking state
    this.mapRunning = false;
    this.lastMap = '';
    this.lastMapSeed = '';
    this.mapCount = 0;
    this.lastMapDetectedTime = 0;
    this.mapCooldownTime = 4000;
    this.pausedTime = 0;
    this.currentMapArea = '';
    this.isMapRun = false;
    
    // Map-specific timer state (separate from session timer)
    this.mapStartTime = null;
    this.mapPausedDuration = 0;
    this.mapPauseStartTime = null;
    
    // Keywords
    this.mapStartKeyword = 'You have entered';
    this.enterHideoutKeyword = 'EnterHideout';
    this.mapGeneratingKeyword = 'Generating level';
    
    // Known towns for filtering (removed Aspirants' Plaza as it's lab entrance)
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
      console.log(`[MAP] [${new Date().toISOString()}] ${message}`);
    }
  }

  isTownOrHideout(mapName) {
    return this.knownTowns.some(town => mapName.includes(town)) || 
           mapName.toLowerCase().includes('hideout');
  }

  extractMapAreaFromGenerating(line) {
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

  isMapArea(areaName) {
    if (!areaName) return false;

    // Standard maps
    if (areaName.startsWith('Map')) return true;

    // List of known Pinnacle/Uber boss areas that don't start with 'Map'
    const nonMapBossAreas = [
      'Synthesis_MapBoss',
      'Synthesis_MapGuardian1',
      'Synthesis_MapGuardian2',
      'Synthesis_MapGuardian3',
      'Synthesis_MapGuardian4',
      'PinnacleBoss_Searing',
      'PinnacleBoss_Eater',
      'PinnacleBoss_Maven',
      'PinnacleBoss_Searing_Uber',
      'PinnacleBoss_Eater_Uber',
      'PinnacleBoss_Maven_Uber',
      'PrimordialBoss3',
      'MavenBoss',
      'MavenHub',
      'AtlasExilesBoss5',
      'LegionLeague',
      'LegionLeague2',
      'LegionLeague3',
      'LegionLeague4',
      'HarvestLeagueBoss',
      'AzmeriLeagueBoss',
      'AfflictionTown1', 
      'AfflictionTown2',
      'AfflictionTown3',
      'AfflictionTown4',
      'AfflictionTown5',
      'AfflictionTown6',
      'BreachBossCold',
      'BreachBossLightning',
      'BreachBossFire',
      'BreachBossPhysical',
      'BreachBossChaos'
      // ===================================
    ];

    return nonMapBossAreas.includes(areaName);
  }

  isHideoutArea(areaName) {
    return areaName && areaName.startsWith('Hideout');
  }

  cleanMapName(mapAreaName) {
    // SPECIFIC MAP NAME FIXES (before removing prefixes)
    // MapWorldsGorge is actually Glacier in PoE2
    if (mapAreaName === 'MapWorldsGorge') {
      return 'Glacier';
    }
    
    if (mapAreaName.startsWith('MapWorlds')) {
      mapAreaName = mapAreaName.replace('MapWorlds', '');
    }
    if (mapAreaName.startsWith('Map')) {
      mapAreaName = mapAreaName.replace('Map', '');
    }
    
    // --- Boss & Special Map Replacements (case-insensitive) ---
    
    // Breach Bosses
    if (mapAreaName.toLowerCase().includes('breachbosscold')) {
      mapAreaName = mapAreaName.replace(/BreachBossCold/gi, 'Tul\'s ');
    }
    if (mapAreaName.toLowerCase().includes('breachbosslightning')) {
      mapAreaName = mapAreaName.replace(/BreachBossLightning/gi, 'Esh');
    }
    if (mapAreaName.toLowerCase().includes('breachbossfire')) {
      mapAreaName = mapAreaName.replace(/BreachBossFire/gi, 'Xoph');
    }
    if (mapAreaName.toLowerCase().includes('breachbossphysical')) {
      mapAreaName = mapAreaName.replace(/BreachBossPhysical/gi, 'Uul-Netol');
    }
    if (mapAreaName.toLowerCase().includes('breachbosschaos')) {
      mapAreaName = mapAreaName.replace(/BreachBossChaos/gi, 'Chayula');
    }

    // Simulacrum
    if (mapAreaName.toLowerCase().includes('afflictiontown')) {
      mapAreaName = mapAreaName.replace(/AfflictionTown\d*/gi, 'Simulacrum');
    }

    // Legion
    if (mapAreaName.toLowerCase().includes('legionleague')) {
      mapAreaName = mapAreaName.replace(/LegionLeague\d*/gi, 'Timeless Conflict');
    }
    
    // Synthesis / Memory Maps
    if (mapAreaName.toLowerCase().includes('synthesis_mapguardian')) {
      mapAreaName = mapAreaName.replace(/Synthesis_MapGuardian\d*/gi, 'Memory Maps');
    }
    if (mapAreaName.toLowerCase().includes('synthesis_mapboss')) {
      mapAreaName = mapAreaName.replace(/Synthesis_MapBoss/gi, 'Cortex');
    }

    // Pinnacle Bosses
    if (mapAreaName.toLowerCase().includes('pinnacleboss_searing_uber')) {
      mapAreaName = mapAreaName.replace(/PinnacleBoss_Searing_Uber/gi, 'Uber Exarch');
    }
    if (mapAreaName.toLowerCase().includes('pinnacleboss_eater_uber')) {
      mapAreaName = mapAreaName.replace(/PinnacleBoss_Eater_Uber/gi, 'Uber Eater');
    }
    if (mapAreaName.toLowerCase().includes('pinnacleboss_maven_uber')) {
      mapAreaName = mapAreaName.replace(/PinnacleBoss_Maven_Uber/gi, 'Uber Maven');
    }
    if (mapAreaName.toLowerCase().includes('pinnacleboss_searing')) {
      mapAreaName = mapAreaName.replace(/PinnacleBoss_Searing/gi, 'Exarch');
    }
    if (mapAreaName.toLowerCase().includes('pinnacleboss_eater')) {
      mapAreaName = mapAreaName.replace(/PinnacleBoss_Eater/gi, 'Eater');
    }
    if (mapAreaName.toLowerCase().includes('pinnacleboss_maven')) {
      mapAreaName = mapAreaName.replace(/PinnacleBoss_Maven/gi, 'Maven');
    }
    // Memory Bosses
        if (mapAreaName.toLowerCase().includes('memoryboss2')) {
      mapAreaName = mapAreaName.replace(/MemoryBoss2/gi, 'Neglect');
    }
        if (mapAreaName.toLowerCase().includes('memoryboss3')) {
      mapAreaName = mapAreaName.replace(/MemoryBoss3/gi, 'Fear');
    }
    if (mapAreaName.toLowerCase().includes('memoryboss1')) {
      mapAreaName = mapAreaName.replace(/MemoryBoss1/gi, 'Dread');
    }
        if (mapAreaName.toLowerCase().includes('memoryboss1_uber')) {
      mapAreaName = mapAreaName.replace(/MemoryBoss1_Uber/gi, 'Uber Fear');
    }
            if (mapAreaName.toLowerCase().includes('memoryboss3_uber')) {
      mapAreaName = mapAreaName.replace(/MemoryBoss3_Uber/gi, 'Uber Dread');
    }

    // Other Bosses
    if (mapAreaName.toLowerCase().includes('primordialboss3')) {
      mapAreaName = mapAreaName.replace(/PrimordialBoss3/gi, 'Exarch');
    }
    if (mapAreaName.toLowerCase().includes('primordialboss4')) {
      mapAreaName = mapAreaName.replace(/PrimordialBoss4/gi, 'Eater');
    }
    if (mapAreaName.toLowerCase().includes('primordialboss2')) {
      mapAreaName = mapAreaName.replace(/PrimordialBoss2/gi, 'Polaric');
    }
    if (mapAreaName.toLowerCase().includes('primordialboss1')) {
      mapAreaName = mapAreaName.replace(/PrimordialBoss1/gi, 'Chyme');
    }
    if (mapAreaName.toLowerCase().includes('atziri2')) {
      mapAreaName = mapAreaName.replace(/Atziri2/gi, 'Atziri');
    }
    if (mapAreaName.toLowerCase().includes('atziri1')) {
      mapAreaName = mapAreaName.replace(/Atziri1/gi, 'Apex');
    }
    if (mapAreaName.toLowerCase().includes('atlasexilesboss5')) {
      mapAreaName = mapAreaName.replace(/AtlasExilesBoss5/gi, 'Sirus');
    }
    if (mapAreaName.toLowerCase().includes('shapersrealm')) {
      mapAreaName = mapAreaName.replace(/Shapersrealm/gi, 'Shaper');
    }
    if (mapAreaName.toLowerCase().includes('elderarena')) {
      mapAreaName = mapAreaName.replace(/ElderArena/gi, 'Elder');
    }
    if (mapAreaName.toLowerCase().includes('elderuber')) {
      mapAreaName = mapAreaName.replace(/ElderUber/gi, 'Uber elder');
    }
    if (mapAreaName.toLowerCase().includes('mavenboss')) {
      mapAreaName = mapAreaName.replace(/MavenBoss/gi, 'Maven');
    }
    if (mapAreaName.toLowerCase().includes('mavenhub')) {
      mapAreaName = mapAreaName.replace(/MavenHub/gi, 'Invitation');
    }
    if (mapAreaName.toLowerCase().includes('harvestleagueboss')) {
      mapAreaName = mapAreaName.replace(/HarvestLeagueBoss/gi, 'Sacred Grove');
    }
    if (mapAreaName.toLowerCase().includes('settlersbossfallenstar')) {
      mapAreaName = mapAreaName.replace(/SettlersBossFallenStar/gi, 'Starfall Craters');
    }
    if (mapAreaName.toLowerCase().includes('azmerileagueboss')) {
      mapAreaName = mapAreaName.replace(/AzmeriLeagueBoss/gi, 'King in the Mists');
    }

    // Unique Maps
    if (mapAreaName.toLowerCase().includes('cursedcryptunique')) {
      mapAreaName = mapAreaName.replace(/CursedCryptUnique/gi, 'Coward\'s Trial');
    }
    if (mapAreaName.toLowerCase().includes('strandunique')) {
      mapAreaName = mapAreaName.replace(/StrandUnique/gi, 'Tuahu');
    }
    if (mapAreaName.toLowerCase().includes('vaalpyramidunique')) {
      mapAreaName = mapAreaName.replace(/VaalPyramidUnique/gi, 'Vaults of Atziri');
    }
    if (mapAreaName.toLowerCase().includes('moontempleunique')) {
      mapAreaName = mapAreaName.replace(/MoonTempleUnique/gi, 'Twilight Temple');
    }
    if (mapAreaName.toLowerCase().includes('museumunique')) {
      mapAreaName = mapAreaName.replace(/MuseumUnique/gi, 'Putrid Cloister');
    }
    if (mapAreaName.toLowerCase().includes('templeunique')) {
      mapAreaName = mapAreaName.replace(/TempleUnique/gi, 'Poorjoy\'s Asylum');
    }
    if (mapAreaName.toLowerCase().includes('dunesunique')) {
      mapAreaName = mapAreaName.replace(/DunesUnique/gi, 'Pillars of Arun');
    }
    if (mapAreaName.toLowerCase().includes('bonecryptunique')) {
      mapAreaName = mapAreaName.replace(/BoneCryptUnique/gi, 'Olmec\'s Sanctum');
    }
    if (mapAreaName.toLowerCase().includes('undergroundseaunique')) {
      mapAreaName = mapAreaName.replace(/UndergroundSeaUnique/gi, 'Oba\'s Trove');
    }
    if (mapAreaName.toLowerCase().includes('shoreunique')) {
      mapAreaName = mapAreaName.replace(/ShoreUnique/gi, 'Mao Kun');
    }
    if (mapAreaName.toLowerCase().includes('atollunique')) {
      mapAreaName = mapAreaName.replace(/AtollUnique/gi, 'Maelström of Chaos');
    }
    if (mapAreaName.toLowerCase().includes('cemeteryunique')) {
      mapAreaName = mapAreaName.replace(/CemeteryUnique/gi, 'Hallowed Ground');
    }
    if (mapAreaName.toLowerCase().includes('promenadeunique')) {
      mapAreaName = mapAreaName.replace(/PromenadeUnique/gi, 'Hall of Grandmasters');
    }
    if (mapAreaName.toLowerCase().includes('necropolisunique')) {
      mapAreaName = mapAreaName.replace(/NecropolisUnique/gi, 'Death and Taxes');
    }
    if (mapAreaName.toLowerCase().includes('undergroundriverunique')) {
      mapAreaName = mapAreaName.replace(/UndergroundRiverUnique/gi, 'Caer Blaidd');
    }
    if (mapAreaName.toLowerCase().includes('overgrownshrineunique')) {
      mapAreaName = mapAreaName.replace(/OvergrownShrineUnique/gi, 'Acton\'s Nightmare');
    }
    
    return mapAreaName;
  }

  // NEW: Map-specific timer methods
  startMapTimer() {
    this.mapStartTime = Date.now();
    this.mapPausedDuration = 0;
    this.mapPauseStartTime = null;
    this.logDebug('Map timer started');
    // Send map-specific timer start event
    this.mainWindow.webContents.send('start-map-timer');
  }

  pauseMapTimer() {
    if (this.mapStartTime && !this.mapPauseStartTime) {
      this.mapPauseStartTime = Date.now();
      this.logDebug('Map timer paused');
      this.mainWindow.webContents.send('pause-map-timer');
    }
  }

  resumeMapTimer() {
    if (this.mapPauseStartTime) {
      this.mapPausedDuration += Date.now() - this.mapPauseStartTime;
      this.mapPauseStartTime = null;
      this.logDebug('Map timer resumed');
      this.mainWindow.webContents.send('resume-map-timer');
    }
  }

  stopMapTimer() {
    this.logDebug('Map timer stopped');
    this.mainWindow.webContents.send('stop-map-timer');
  }

  // Updated pauseTimer method to use map-specific timer
  pauseTimer() {
    if (this.mapRunning) {
      this.logDebug('Pausing map timer');
      this.mapRunning = false;
      this.pausedTime = Date.now();
      this.pauseMapTimer();
      return true;
    }
    this.logDebug('Timer was not running, no need to pause');
    return false;
  }

processMapGeneration(line) {
  if (!line.includes(this.mapGeneratingKeyword)) return false;

  this.logDebug(`Found generating line: ${line}`);
  const mapInfo = this.extractMapAreaFromGenerating(line);
  const currentTime = Date.now();
  
  if (!mapInfo) {
    return false;
  }

  // CASE 1: The generated area IS a map.
  if (this.isMapArea(mapInfo.area)) {
    this.logDebug(`Map generation detected: ${mapInfo.area}`);
    this.currentMapArea = mapInfo.area;
    const isDifferentMap = (mapInfo.seed !== this.lastMapSeed) || (mapInfo.area !== this.lastMap);
    
    // Check if this is a NEW map (different from the last) and the cooldown has passed
    if (isDifferentMap && currentTime - this.lastMapDetectedTime > this.mapCooldownTime) {
      this.logDebug(`New map run detected: ${mapInfo.area}`);
      this.mapCount++;
      this.lastMap = mapInfo.area;
      this.lastMapSeed = mapInfo.seed;
      this.lastMapDetectedTime = currentTime;
      this.isMapRun = true;
      
      const cleanedMapName = this.cleanMapName(mapInfo.area);
      
      // --- MODIFICATION: Log activity ---
      this.activityLogger(`[MAP] Started map: ${cleanedMapName} (Total maps: ${this.mapCount})`);
      // --- END MODIFICATION ---

      // Notify StarfallTracker that a new map started
      if (this.starfallTracker) {
        this.starfallTracker.onNewMapStarted(mapInfo.seed);
      }

      this.mainWindow.webContents.send('update-map-count', `Maps: ${this.mapCount}`);
      this.mainWindow.webContents.send('update-map-name', cleanedMapName);
      this.mainWindow.webContents.send('switch-to-map-timer');
      
      // *** CORRECTION 1: Only call startMapTimer() for a truly NEW map ***
      if (!this.mapRunning) {
        this.logDebug('Starting NEW map timer');
        this.mapRunning = true;
        this.startMapTimer(); // Resets timer and starts fresh
      }
    
    // Check if we're re-entering the SAME map and the timer was paused.
    } else if (mapInfo.area === this.lastMap && !this.mapRunning && this.isMapRun) {
      this.logDebug('Resuming map timer for same map');
      this.mapRunning = true;
      this.resumeMapTimer(); // Correctly resumes the timer
    }
    
    return true;
  }

  // CASE 2: The area is NOT a map, AND a map run was active.
  if (!this.isMapArea(mapInfo.area) && this.isMapRun) {
    this.logDebug(`Detected non-map area (${mapInfo.area}). Temporarily PAUSING map run.`);
    
    // *** CRITICAL FIX: KEEP this.isMapRun = true. ONLY PAUSE ***
    this.mapRunning = false;
    // this.isMapRun = false; // <--- DO NOT RESET THIS HERE!
    this.pauseMapTimer();   // This preserves the timer's value.
    
    // Return FALSE so the ActTracker can process the line.
    return false;
  }
  
  return false;
}
processAreaEntry(line) {
    if (!line.includes(this.mapStartKeyword)) return false;

    const mapNameMatch = line.match(/You have entered (.+)/);
    const enteredArea = mapNameMatch ? mapNameMatch[1].trim() : 'Unknown';
    this.logDebug(`Detected area entry: ${enteredArea}`);

    // Check if entering a town (but NOT hideout - hideout is handled separately)
    if (this.isTownOrHideout(enteredArea) && !enteredArea.toLowerCase().includes('hideout')) {
      this.logDebug(`Entering town: ${enteredArea}`);
      
      // --- MODIFICATION: Log map finish on town entry ---
      if (this.mapRunning || this.isMapRun) {
        // this.activityLogger(`[MAP] Map run finished. Entered town: ${enteredArea}`); // <-- OLD: We don't want to log "finished"
        this.logDebug(`[MAP] Pausing map run for town entry (death/portal): ${enteredArea}`); // <-- NEW
      }
      // --- END MODIFICATION ---

      this.pauseTimer();
      // this.isMapRun = false; // <-- REMOVED: This ended the run, which was the bug.
      // this.currentMapArea = ''; // <-- REMOVED: This cleared the map, which was the bug.
      return true;
    }

    // Special handling for hideout entry via "You have entered"
    if (enteredArea.toLowerCase().includes('hideout')) {
      this.logDebug(`Hideout entry via 'You have entered' (death/portal): ${enteredArea}`);

      // --- MODIFICATION: Just pause, don't log finish or stop timer ---
      if (this.mapRunning || this.isMapRun) {
         this.logDebug(`[MAP] Pausing map run for hideout entry.`);
         this.pauseTimer(); // This pauses the map-specific timer
      }
      // --- END MODIFICATION ---

      // DO NOT clear currentMapArea
      // DO NOT set isMapRun = false
      // DO NOT call stopMapTimer()
      return true;
    }

    // CRITICAL: If entering ANY map area and we have previous map data, restore it
    if (this.isMapArea(enteredArea)) {
      this.logDebug(`Entering map area: ${enteredArea}`);
      
      // If we have map count and this could be a restoration scenario (e.g., currentMapArea was reset)
      if (this.mapCount > 0 && !this.currentMapArea) {
        this.logDebug(`Restoring map state: mapCount=${this.mapCount}, lastMap=${this.lastMap}`);
        this.currentMapArea = enteredArea;
        this.lastMap = enteredArea;
        this.isMapRun = true;
        
        // Always show current map counter when entering any map
        const cleanedMapName = this.cleanMapName(enteredArea);
        this.logDebug(`Restoring UI: counter="Maps: ${this.mapCount}", name="${cleanedMapName}"`);
        this.mainWindow.webContents.send('update-map-count', `Maps: ${this.mapCount}`);
        this.mainWindow.webContents.send('update-map-name', cleanedMapName);
        this.mainWindow.webContents.send('switch-to-map-timer');
        
        // *** FIX: Changed startMapTimer() to resumeMapTimer() to preserve elapsed time ***
        if (!this.mapRunning) {
          this.logDebug('Resuming map timer for restored map');
          this.mapRunning = true;
          this.resumeMapTimer(); // Correct: Uses the paused duration
        }
        return true;
      }
      
      // Handle resuming existing map (when currentMapArea is still set and we paused via generation log)
      if (enteredArea === this.currentMapArea && !this.mapRunning && this.isMapRun) {
        this.logDebug(`Resuming existing map: ${enteredArea}`);
        this.mapRunning = true;
        
        const cleanedMapName = this.cleanMapName(this.currentMapArea);
        this.mainWindow.webContents.send('update-map-count', `Maps: ${this.mapCount}`);
        this.mainWindow.webContents.send('update-map-name', cleanedMapName);
        this.mainWindow.webContents.send('switch-to-map-timer');
        this.resumeMapTimer();
        return true;
      }
    }

    return false;
  }
processHideoutEntry(line) {
  const isEnterHideoutKeyword = line.includes(this.enterHideoutKeyword);
  // We remove the duplicate check for 'You have entered' because processAreaEntry already handles it.
  
  if (!isEnterHideoutKeyword) return false;

  this.logDebug(`Hideout entry detected (via portal click 'EnterHideout').`);
  
  // --- MODIFICATION: Just pause, don't stop ---
  if (this.mapRunning || this.isMapRun) {
    this.logDebug('Pausing map timer for hideout portal entry');
    this.pauseTimer(); // This pauses the map-specific timer
  }
  // --- END MODIFICATION ---
  
  // DO NOT clear currentMapArea
  // DO NOT set isMapRun = false
  // DO NOT call stopMapTimer()

  // Return false to allow other trackers (like ActTracker) to also see the hideout line if needed.
  return false;
}

  processLine(line) {
    this.logDebug(`MAP: Processing line: ${line.substring(0, 100)}...`);
    
    // Process map-related lines (includes hideout detection now)
    if (this.processMapGeneration(line)) {
      this.logDebug('MAP: Line consumed by processMapGeneration');
      return;
    }
    if (this.processAreaEntry(line)) {
      this.logDebug('MAP: Line consumed by processAreaEntry');
      return;
    }
    // Keep the old hideout entry method as fallback
    if (this.processHideoutEntry(line)) {
      this.logDebug('MAP: Line consumed by processHideoutEntry');
      return;
    }
    this.logDebug('MAP: Line not consumed by any map processor');
  }

  // Getters for state
  getMapCount() {
    return this.mapCount;
  }

  isMapRunning() {
    return this.mapRunning;
  }

  // *** NEW a
  getCleanCurrentMapName() {
    return this.currentMapArea ? this.cleanMapName(this.currentMapArea) : '';
  }

  getCurrentMapArea() {
    return this.currentMapArea;
  }

  isCurrentlyInMap() {
    return this.isMapRun;
  }

  getMapElapsedTime() {
    if (!this.mapStartTime) return 0;
    
    let elapsed = Date.now() - this.mapStartTime - this.mapPausedDuration;
    
    if (this.mapPauseStartTime) {
      elapsed -= Date.now() - this.mapPauseStartTime;
    }
    
    return Math.max(0, Math.floor(elapsed / 1000));
  }
}

module.exports = MapTracker;