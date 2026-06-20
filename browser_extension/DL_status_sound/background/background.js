// Download Status Sound - Background Service Worker
// Monitors downloads and plays sound notifications

// ==================== Default Settings ====================
const DEFAULT_SETTINGS = {
  enabled: true,
  sounds: {
    download_started: { enabled: false, volume: 0.5 },
    download_completed: { enabled: true, volume: 0.7 },
    download_failed: { enabled: true, volume: 0.8 },
    download_interrupted: { enabled: true, volume: 0.7 },
    download_cancelled: { enabled: false, volume: 0.5 },
    download_erased: { enabled: false, volume: 0.5 }
  },
  notifications: {
    enabled: true,
    showProgressBar: true,
    completedMessage: 'Download completed: $title$',
    failedMessage: 'Download failed: $title$',
    interruptedMessage: 'Download interrupted: $title$'
  },
  filters: {
    excludedDomains: [],
    allowedExtensions: [],
    minFileSize: 0,
    excludedPatterns: []
  },
  schedule: {
    enabled: false,
    startTime: '23:00',
    endTime: '07:00'
  },
  history: {
    maxEntries: 50
  }
};

// ==================== State Management ====================
let appSettings = null;
let activeDownloads = new Map();
let downloadHistory = [];
let downloadProgressTracker = new Map(); // Track receivedBytes for progress display

// ==================== Initialization ====================
async function initialize() {
  try {
    const result = await chrome.storage.local.get(['settings', 'history']);
    if (result.settings) {
      appSettings = { ...DEFAULT_SETTINGS, ...result.settings };
      // Deep merge sounds
      if (result.settings.sounds) {
        appSettings.sounds = { ...DEFAULT_SETTINGS.sounds, ...result.settings.sounds };
        for (const key of Object.keys(DEFAULT_SETTINGS.sounds)) {
          if (result.settings.sounds[key]) {
            appSettings.sounds[key] = { ...DEFAULT_SETTINGS.sounds[key], ...result.settings.sounds[key] };
          }
        }
      }
    } else {
      appSettings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    }
    downloadHistory = result.history || [];

    console.log('[DownloadStatusSound] Extension initialized');
    setupDownloadListeners();
  } catch (error) {
    console.error('[DownloadStatusSound] Initialization error:', error);
    appSettings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    setupDownloadListeners();
  }
}

// ==================== Download Event Listeners ====================
function setupDownloadListeners() {
  chrome.downloads.onCreated.addListener(onDownloadCreated);
  chrome.downloads.onChanged.addListener(onDownloadChanged);
}

async function onDownloadCreated(downloadItem) {
  if (!appSettings?.enabled) return;
  if (await shouldSkipDownload(downloadItem)) return;

  const soundConfig = appSettings.sounds.download_started;
  if (soundConfig?.enabled) {
    playSound('download_started', soundConfig.volume);
  }

  activeDownloads.set(downloadItem.id, { ...downloadItem, startTime: new Date().toISOString() });

  if (appSettings.notifications.enabled) {
    showNotification('download_started', `Download started: ${downloadItem.filename || 'Unknown file'}`);
  }
}

async function onDownloadChanged(downloadDelta) {
  if (!appSettings?.enabled) return;
  if (!downloadDelta?.id) return;

  // Get existing download data or create empty object for new downloads
  const existingDownload = activeDownloads.get(downloadDelta.id);
  const downloadItem = { ...existingDownload, ...downloadDelta };

  // Track receivedBytes for progress display in popup
  // Note: Firefox reports receivedBytes as cumulative value (not delta)
  // Chrome may report it as delta in some cases, so we use the full download item value when available
  if (downloadDelta.state?.current === 'in_progress') {
    // Use downloadItem.receivedBytes if available (it's the current cumulative value)
    // Fall back to delta.delta.receivedBytes only if downloadItem doesn't have it
    const receivedBytes = downloadItem.receivedBytes ?? downloadDelta.delta?.receivedBytes;
    if (receivedBytes !== undefined && receivedBytes >= 0) {
      downloadProgressTracker.set(downloadDelta.id, {
        receivedBytes: receivedBytes,
        totalBytes: downloadItem.totalBytes || 0
      });
    }
  }

  // Handle state changes - these need the complete downloadItem data
  if (downloadDelta.state) {
    if (downloadDelta.state.current === 'complete') {
      await handleDownloadComplete(downloadItem);
      downloadProgressTracker.delete(downloadDelta.id);
      // Remove from active downloads after handling completion
      activeDownloads.delete(downloadDelta.id);
    } else if (downloadDelta.state.current === 'interrupted') {
      await handleDownloadInterrupted(downloadItem, downloadDelta);
      // Keep in active downloads for potential retry tracking
      activeDownloads.set(downloadDelta.id, downloadItem);
    } else if (downloadDelta.state.current === 'removed') {
      await handleDownloadErased(downloadItem);
      // Remove from active downloads after handling removal
      activeDownloads.delete(downloadDelta.id);
      downloadProgressTracker.delete(downloadDelta.id);
    } else {
      // Update for other state changes (e.g., in_progress)
      activeDownloads.set(downloadDelta.id, downloadItem);
    }
  }
}

// ==================== Event Handlers ====================
async function handleDownloadErased(downloadItem) {
  const soundConfig = appSettings.sounds.download_erased;
  if (soundConfig?.enabled) {
    playSound('download_erased', soundConfig.volume);
  }

  if (appSettings.notifications.enabled) {
    showNotification('download_erased', `Download erased: ${downloadItem.filename || 'Unknown file'}`);
  }

  addToHistory(downloadItem, 'download_erased');
}

async function handleDownloadComplete(downloadItem) {
  const soundConfig = appSettings.sounds.download_completed;
  if (soundConfig?.enabled) {
    playSound('download_completed', soundConfig.volume);
  }

  if (appSettings.notifications.enabled) {
    let message = appSettings.notifications.completedMessage
      .replace('$title$', downloadItem.filename || 'Unknown file')
      .replace('$url$', downloadItem.url || '')
      .replace('$totalBytes$', formatFileSize(downloadItem.totalBytes));
    showNotification('download_completed', message);
  }

  addToHistory(downloadItem, 'download_completed');
  // Note: activeDownloads deletion is handled in onDownloadChanged
}

async function handleDownloadInterrupted(downloadItem, downloadDelta) {
  // chrome.downloads.InterruptReason codes:
  // 0 = NONE, 1 = FILE_FAILED, 2 = FILE_BLOCKED, 3 = RESUME_ERROR,
  // 4 = USER_CANCELED, 5 = FILE_TOO_LARGE, 6 = DISK_FULL, 7 = DISABLED,
  // 8 = CROSS_REDIRECT, 9 = FAILED
  const interruptReason = downloadDelta?.interruptReason;
  let eventType = 'download_interrupted';

  if (interruptReason === 4) { // USER_CANCELED
    eventType = 'download_cancelled';
  } else if (interruptReason === 1 || interruptReason === 9 || interruptReason === 2) {
    // FILE_FAILED, FAILED, FILE_BLOCKED
    eventType = 'download_failed';
  } else if (interruptReason === 5 || interruptReason === 6 || interruptReason === 7) {
    // FILE_TOO_LARGE, DISK_FULL, DISABLED
    eventType = 'download_failed';
  }

  const soundConfig = appSettings.sounds[eventType];
  if (soundConfig?.enabled) {
    playSound(eventType, soundConfig.volume);
  }

  if (appSettings.notifications.enabled) {
    let message;
    switch (eventType) {
      case 'download_failed':
        message = appSettings.notifications.failedMessage.replace('$title$', downloadItem.filename || 'Unknown file');
        break;
      case 'download_cancelled':
        message = `Download cancelled: ${downloadItem.filename || 'Unknown file'}`;
        break;
      default:
        message = appSettings.notifications.interruptedMessage.replace('$title$', downloadItem.filename || 'Unknown file');
    }
    showNotification(eventType, message);
  }

  addToHistory(downloadItem, eventType);
}

// ==================== Filter Functions ====================
async function shouldSkipDownload(downloadItem) {
  if (!appSettings?.filters) return false;

  const { excludedDomains, allowedExtensions, minFileSize, excludedPatterns } = appSettings.filters;

  // Check excluded domains
  if (excludedDomains?.length > 0 && downloadItem.url) {
    try {
      const url = new URL(downloadItem.url);
      if (excludedDomains.some(domain => url.hostname.endsWith(domain))) return true;
    } catch (e) { /* ignore */ }
  }

  // Check excluded patterns
  if (excludedPatterns?.length > 0 && downloadItem.url) {
    for (const pattern of excludedPatterns) {
      try {
        if (new RegExp(pattern, 'i').test(downloadItem.url)) return true;
      } catch (e) { /* ignore */ }
    }
  }

  // Check min file size
  if (minFileSize > 0 && downloadItem.totalBytes && downloadItem.totalBytes < minFileSize) return true;

  // Check allowed extensions
  if (allowedExtensions?.length > 0 && downloadItem.filename) {
    const fileExt = downloadItem.filename.split('.').pop()?.toLowerCase();
    if (!allowedExtensions.includes(fileExt)) return true;
  }

  return false;
}

// ==================== Sound Functions ====================
let audioCtx = null;

function getAudioContext() {
  // If existing context was closed/suspended, create a new one
  if (!audioCtx || audioCtx.state === 'closed' || audioCtx.state === 'interrupted') {
    try {
      audioCtx = new (self.AudioContext || self.webkitAudioContext)();
    } catch (e) {
      console.error('[DownloadStatusSound] Failed to create AudioContext:', e);
      return null;
    }
  }
  // Resume suspended context (Firefox requires this after user interaction block)
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(err => console.warn('[DownloadStatusSound] Failed to resume AudioContext:', err));
  }
  return audioCtx;
}

async function playSound(eventType, volume) {
  // Check schedule mute
  if (appSettings?.schedule?.enabled && isInQuietHours()) return;

  try {
    // Check for custom sound blob
    const blobResult = await chrome.storage.local.get('customSoundBlob_' + eventType);
    if (blobResult['customSoundBlob_' + eventType]) {
      const audio = new Audio(blobResult['customSoundBlob_' + eventType]);
      audio.volume = volume || 0.5;
      await audio.play().catch(err => console.warn('[DownloadStatusSound] Custom sound failed:', err));
      return;
    }

    // Play Web Audio API default tone
    const ctx = getAudioContext();
    if (ctx) {
      playDefaultTone(ctx, eventType, volume || 0.5);
    }
  } catch (error) {
    console.error('[DownloadStatusSound] Error playing sound:', error);
  }
}

function playDefaultTone(ctx, eventType, volume) {
  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();

  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);

  switch (eventType) {
    case 'download_completed':
      oscillator.frequency.value = 880;
      gainNode.gain.setValueAtTime(volume, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.5);
      break;
    case 'download_failed':
    case 'download_interrupted':
      oscillator.frequency.value = 200;
      gainNode.gain.setValueAtTime(volume, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.6);
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.6);
      break;
    case 'download_cancelled':
    case 'download_erased':
      oscillator.frequency.value = 440;
      gainNode.gain.setValueAtTime(volume * 0.7, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.3);
      break;
    case 'download_started':
      oscillator.frequency.value = 660;
      gainNode.gain.setValueAtTime(volume * 0.4, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.2);
      break;
    default:
      oscillator.frequency.value = 440;
      gainNode.gain.setValueAtTime(volume, ctx.currentTime);
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.3);
  }
}

// ==================== Notification Functions ====================
async function showNotification(type, message) {
  if (!appSettings?.notifications?.enabled) return;

  try {
    await chrome.notifications.create({
      type: 'basic',
      title: 'Download Status Sound',
      message: message,
      iconUrl: 'icons/icon128.png',
      priority: 2,
      requireInteraction: (type === 'download_failed' || type === 'download_interrupted')
    });
  } catch (error) {
    console.error('[DownloadStatusSound] Notification error:', error);
  }
}

// ==================== History Functions ====================
function addToHistory(downloadItem, eventType) {
  const entry = {
    id: downloadItem.id,
    url: downloadItem.url,
    filename: downloadItem.filename || 'Unknown',
    eventType: eventType,
    timestamp: new Date().toISOString(),
    fileSize: downloadItem.totalBytes || downloadItem.fileSize || 0
  };

  downloadHistory.unshift(entry);
  if (downloadHistory.length > (appSettings?.history?.maxEntries || 50)) {
    downloadHistory = downloadHistory.slice(0, 50);
  }
  chrome.storage.local.set({ history: downloadHistory });
}

// ==================== Schedule Functions ====================
function isInQuietHours() {
  if (!appSettings?.schedule?.enabled) return false;

  const now = new Date();
  const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const { startTime, endTime } = appSettings.schedule;

  if (startTime < endTime) {
    return currentTime >= startTime && currentTime <= endTime;
  } else {
    return currentTime >= startTime || currentTime <= endTime;
  }
}

// ==================== Utility Functions ====================
function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// ==================== Storage Event Listener ====================
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && changes.settings) {
    const newSettings = changes.settings.newValue;
    if (!newSettings) return;
    
    // Use a temporary object to avoid race conditions
    const tempSettings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    
    if (newSettings.sounds) {
      for (const key of Object.keys(DEFAULT_SETTINGS.sounds)) {
        if (newSettings.sounds[key]) {
          tempSettings.sounds[key] = { ...DEFAULT_SETTINGS.sounds[key], ...newSettings.sounds[key] };
        }
      }
    }
    
    // Merge other settings
    for (const key of Object.keys(DEFAULT_SETTINGS)) {
      if (key !== 'sounds' && newSettings?.[key]) {
        tempSettings[key] = { ...DEFAULT_SETTINGS[key], ...newSettings[key] };
      }
    }
    
    // Atomically update appSettings to prevent partial state
    appSettings = tempSettings;
    console.log('[DownloadStatusSound] Settings updated');
  }
});

// ==================== Message Listener ====================
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'getSettings') {
    sendResponse(appSettings);
    return true;
  }
  if (message.action === 'testSound') {
    playSound(message.eventType, message.volume || 0.5);
    sendResponse({ success: true });
    return true;
  }
  if (message.action === 'getHistory') {
    sendResponse(downloadHistory);
    return true;
  }
  if (message.action === 'clearHistory') {
    downloadHistory = [];
    chrome.storage.local.set({ history: [] });
    sendResponse({ success: true });
    return true;
  }
  if (message.action === 'getDownloadProgress') {
    // Return progress data for active downloads
    const result = [];
    chrome.downloads.search({}, (downloads) => {
      if (!downloads || !Array.isArray(downloads)) {
        sendResponse(result);
        return;
      }
      for (const d of downloads) {
        if (d?.state?.current === 'in_progress') {
          const progress = downloadProgressTracker.get(d.id);
          result.push({
            id: d.id,
            filename: d.filename,
            totalBytes: d.totalBytes || 0,
            receivedBytes: progress?.receivedBytes || 0,
            state: d.state.current,
            exists: d.exists
          });
        }
      }
      sendResponse(result);
    });
    return true; // Keep message channel open for async response
  }
});

// ==================== Start ====================
initialize();