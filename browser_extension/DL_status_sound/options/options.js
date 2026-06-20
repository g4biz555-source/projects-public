// Download Status Sound - Options Page Script

// Event definitions and labels
const EVENT_DEFS = [
  { key: 'download_started', label: 'Download Started', icon: '▶️' },
  { key: 'download_completed', label: 'Download Completed', icon: '✅' },
  { key: 'download_failed', label: 'Download Failed', icon: '❌' },
  { key: 'download_interrupted', label: 'Download Interrupted', icon: '⚠️' },
  { key: 'download_cancelled', label: 'Download Cancelled', icon: '🛑' },
  { key: 'download_erased', label: 'Download Erased', icon: '🗑️' }
];

let currentSettings = null;

// ==================== Initialization ====================
document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  loadHistory();
  setupEventListeners();
});

async function loadSettings() {
  try {
    // Load settings and all custom sound blob indicators
    const result = await chrome.storage.local.get(['settings', 
      'customSoundBlob_download_started', 'customSoundBlob_download_completed', 'customSoundBlob_download_failed',
      'customSoundBlob_download_interrupted', 'customSoundBlob_download_cancelled', 'customSoundBlob_download_erased',
      'customSoundName_download_started', 'customSoundName_download_completed', 'customSoundName_download_failed',
      'customSoundName_download_interrupted', 'customSoundName_download_cancelled', 'customSoundName_download_erased']);
    
    if (result.settings) {
      currentSettings = JSON.parse(JSON.stringify({
        ...getDefaultSettings(),
        ...result.settings,
        sounds: {
          ...getDefaultSettings().sounds,
          ...(result.settings.sounds || {})
        }
      }));
      // Deep merge sound configs
      for (const key of Object.keys(getDefaultSettings().sounds)) {
        if (result.settings.sounds?.[key]) {
          currentSettings.sounds[key] = {
            ...getDefaultSettings().sounds[key],
            ...(result.settings.sounds[key] || {})
          };
        }
      }
    } else {
      currentSettings = JSON.parse(JSON.stringify(getDefaultSettings()));
    }
    
    // Restore custom sound file indicators and filenames from storage
    for (const key of Object.keys(getDefaultSettings().sounds)) {
      if (result['customSoundBlob_' + key]) {
        if (!currentSettings.sounds[key]) {
          currentSettings.sounds[key] = { ...getDefaultSettings().sounds[key] };
        }
        currentSettings.sounds[key].customFile = result['customSoundBlob_' + key];
      }
      // Restore the filename for display
      if (result['customSoundName_' + key]) {
        if (!currentSettings.sounds[key]) {
          currentSettings.sounds[key] = { ...getDefaultSettings().sounds[key] };
        }
        currentSettings.sounds[key].fileName = result['customSoundName_' + key];
      }
    }
    
    renderUI();
  } catch (error) {
    console.error('Error loading settings:', error);
    currentSettings = JSON.parse(JSON.stringify(getDefaultSettings()));
    renderUI();
  }
}

function getDefaultSettings() {
  return {
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
    }
  };
}

// ==================== UI Rendering ====================
function renderUI() {
  // Main toggle
  document.getElementById('mainToggle').checked = currentSettings.enabled;
  
  // Sound settings
  renderSoundSettings();
  
  // Notification settings
  document.getElementById('notifToggle').checked = currentSettings.notifications.enabled;
  document.getElementById('completedMsg').value = currentSettings.notifications.completedMessage || '';
  document.getElementById('failedMsg').value = currentSettings.notifications.failedMessage || '';
  
  // Filter settings
  document.getElementById('excludedDomains').value = (currentSettings.filters.excludedDomains || []).join('\n');
  document.getElementById('excludedPatterns').value = (currentSettings.filters.excludedPatterns || []).join('\n');
  document.getElementById('allowedExtensions').value = (currentSettings.filters.allowedExtensions || []).join('\n');
  document.getElementById('minFileSize').value = currentSettings.filters.minFileSize || 0;
  
  // Schedule settings
  document.getElementById('scheduleToggle').checked = currentSettings.schedule.enabled;
  document.getElementById('startTime').value = currentSettings.schedule.startTime || '23:00';
  document.getElementById('endTime').value = currentSettings.schedule.endTime || '07:00';
}

function renderSoundSettings() {
  const container = document.getElementById('soundSettings');
  container.textContent = '';
  
  for (const event of EVENT_DEFS) {
    const soundConfig = currentSettings.sounds[event.key] || {};
    
    const div = document.createElement('div');
    div.className = 'sound-event';
    
    // Header section
    const headerDiv = document.createElement('div');
    headerDiv.className = 'sound-event-header';
    
    const titleSpan = document.createElement('span');
    titleSpan.className = 'sound-event-title';
    titleSpan.textContent = event.icon + ' ' + event.label;
    
    const controlsDiv = document.createElement('div');
    controlsDiv.className = 'sound-event-controls';
    
    const labelEl = document.createElement('label');
    labelEl.className = 'switch';
    
    const toggleInput = document.createElement('input');
    toggleInput.type = 'checkbox';
    toggleInput.dataset.event = event.key;
    toggleInput.className = 'sound-toggle';
    if (soundConfig.enabled) {
      toggleInput.checked = true;
    }
    
    const sliderSpan = document.createElement('span');
    sliderSpan.className = 'slider';
    
    labelEl.appendChild(toggleInput);
    labelEl.appendChild(sliderSpan);
    controlsDiv.appendChild(labelEl);
    
    headerDiv.appendChild(titleSpan);
    headerDiv.appendChild(controlsDiv);
    
    // Volume control section
    const volumeControlDiv = document.createElement('div');
    volumeControlDiv.className = 'volume-control';
    
    const volumeLabel = document.createTextNode('Volume:');
    volumeControlDiv.appendChild(volumeLabel);
    
    const volumeSlider = document.createElement('input');
    volumeSlider.type = 'range';
    volumeSlider.min = '0';
    volumeSlider.max = '100';
    volumeSlider.value = Math.round((soundConfig.volume || 0.5) * 100);
    volumeSlider.dataset.event = event.key;
    volumeSlider.className = 'volume-slider';
    
    const volumeValueSpan = document.createElement('span');
    volumeValueSpan.className = 'volume-value';
    volumeValueSpan.textContent = Math.round((soundConfig.volume || 0.5) * 100) + '%';
    
    const testBtn = document.createElement('button');
    testBtn.className = 'test-btn';
    testBtn.dataset.event = event.key;
    testBtn.textContent = 'Test';
    
    volumeControlDiv.appendChild(volumeSlider);
    volumeControlDiv.appendChild(volumeValueSpan);
    volumeControlDiv.appendChild(testBtn);
    
    // Custom sound section
    const customSoundDiv = document.createElement('div');
    customSoundDiv.className = 'custom-sound-section';
    
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.wav,.ogg,.mp3,audio/wav,audio/ogg,audio/mpeg';
    fileInput.dataset.event = event.key;
    fileInput.className = 'sound-file-input';
    fileInput.style.display = 'none';
    
    const selectBtn = document.createElement('button');
    selectBtn.className = 'btn-small btn-select-sound';
    selectBtn.dataset.event = event.key;
    selectBtn.textContent = 'Select File';
    
    const statusSpan = document.createElement('span');
    statusSpan.className = soundConfig.customFile ? 'sound-status status-custom' : 'sound-status status-default';
    if (soundConfig.fileName) {
      statusSpan.title = soundConfig.fileName;
    }
    statusSpan.textContent = soundConfig.customFile ? (soundConfig.fileName || 'Custom') : 'No file selected';
    
    customSoundDiv.appendChild(fileInput);
    customSoundDiv.appendChild(selectBtn);
    customSoundDiv.appendChild(statusSpan);
    
    if (soundConfig.customFile) {
      const removeBtn = document.createElement('button');
      removeBtn.className = 'btn-small btn-remove-sound';
      removeBtn.dataset.event = event.key;
      removeBtn.textContent = 'Remove';
      customSoundDiv.appendChild(removeBtn);
    }
    
    div.appendChild(headerDiv);
    div.appendChild(volumeControlDiv);
    div.appendChild(customSoundDiv);
    container.appendChild(div);
  }
  
  // Add event listeners for new elements using event delegation on container
  container.addEventListener('change', (e) => {
    const target = e.target;
    if (target.classList.contains('sound-toggle')) {
      onSoundToggle(e);
    } else if (target.classList.contains('volume-slider')) {
      // Handle volume slider input separately
    } else if (target.classList.contains('sound-file-input')) {
      onSoundFileSelect(e);
    }
  });
  
  container.addEventListener('input', (e) => {
    const target = e.target;
    if (target.classList.contains('volume-slider')) {
      onVolumeChange(e);
    }
  });
  
  container.addEventListener('click', (e) => {
    const target = e.target;
    if (target.classList.contains('test-btn')) {
      onTestSound(e);
    } else if (target.classList.contains('btn-remove-sound')) {
      onRemoveCustomSound(e);
    } else if (target.classList.contains('btn-select-sound')) {
      onSelectSoundFileClick(e);
    }
  });
}

function onSelectSoundFileClick(e) {
  const eventKey = e.target.dataset.event;
  // Find the hidden file input and trigger click
  const fileInput = e.target.parentElement.querySelector('.sound-file-input');
  if (fileInput) {
    fileInput.click();
  }
}

// ==================== Event Handlers ====================
async function onSoundToggle(e) {
  const eventKey = e.target.dataset.event;
  currentSettings.sounds[eventKey].enabled = e.target.checked;
  showSaveIndicator();
  await saveSettings();
}

async function onVolumeChange(e) {
  const eventKey = e.target.dataset.event;
  const value = parseInt(e.target.value);
  currentSettings.sounds[eventKey].volume = value / 100;
  e.target.parentElement.querySelector('.volume-value').textContent = value + '%';
  showSaveIndicator();
  await saveSettings();
}

async function onTestSound(e) {
  const eventKey = e.target.dataset.event;
  const volume = currentSettings.sounds[eventKey]?.volume || 0.5;
  
  try {
    await chrome.runtime.sendMessage({ action: 'testSound', eventType: eventKey, volume: volume });
  } catch (error) {
    console.error('Test sound failed:', error);
  }
}

async function onSoundFileSelect(e) {
  const file = e.target.files[0];
  if (!file) return;
  
  const eventKey = e.target.dataset.event;
  
  // Validate file type
  const validTypes = ['audio/wav', 'audio/ogg', 'audio/mpeg', 'audio/mp3', 'audio/wave'];
  const validExtensions = ['.wav', '.ogg', '.mp3'];
  const ext = '.' + file.name.split('.').pop().toLowerCase();
  
  if (!validTypes.includes(file.type) && !validExtensions.includes(ext)) {
    alert('Please select a WAV, OGG, or MP3 file.');
    e.target.value = '';
    return;
  }
  
  // Validate file size (max 5MB for storage)
  if (file.size > 5 * 1024 * 1024) {
    alert('File size must be under 5MB.');
    e.target.value = '';
    return;
  }
  
  try {
    // Convert file to base64 for storage
    const reader = new FileReader();
    const base64Data = await new Promise((resolve, reject) => {
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    
    // Store the blob URL and filename
    await chrome.storage.local.set({ 
      ['customSoundBlob_' + eventKey]: base64Data,
      ['customSoundName_' + eventKey]: file.name
    });
    
    // Update settings
    if (!currentSettings.sounds[eventKey]) {
      currentSettings.sounds[eventKey] = { ...getDefaultSettings().sounds[eventKey] };
    }
    currentSettings.sounds[eventKey].customFile = base64Data;
    currentSettings.sounds[eventKey].fileName = file.name;
    
    // Update UI - update the status text and add/remove remove button
    const customSoundSection = e.target.parentElement;
    const statusEl = customSoundSection.querySelector('.sound-status');
    statusEl.textContent = file.name;
    statusEl.title = file.name;
    statusEl.className = 'sound-status status-custom';
    
    // Check if remove button exists, if not create it
    let removeBtn = customSoundSection.querySelector('.btn-remove-sound');
    if (!removeBtn) {
      removeBtn = document.createElement('button');
      removeBtn.className = 'btn-small btn-remove-sound';
      removeBtn.addEventListener('click', onRemoveCustomSound);
      customSoundSection.appendChild(removeBtn);
    }
    
    // Clear the file input so selecting the same file again triggers onchange
    e.target.value = '';
    
    showSaveIndicator();
  } catch (error) {
    console.error('Error saving sound file:', error);
    alert('Failed to save sound file. It may be too large.');
  }
}

async function onRemoveCustomSound(e) {
  const eventKey = e.target.dataset.event || e.target.parentElement.querySelector('.btn-remove-sound')?.dataset.event;
  if (!eventKey) return;
  
  try {
    await chrome.storage.local.remove(['customSoundBlob_' + eventKey, 'customSoundName_' + eventKey]);
    
    if (currentSettings.sounds[eventKey]) {
      currentSettings.sounds[eventKey].customFile = null;
      currentSettings.sounds[eventKey].fileName = undefined;
    }
    
    // Re-render sound settings
    renderSoundSettings();
    showSaveIndicator();
    await saveSettings();
  } catch (error) {
    console.error('Error removing custom sound:', error);
  }
}

function setupEventListeners() {
  // Main toggle
  document.getElementById('mainToggle').addEventListener('change', async (e) => {
    currentSettings.enabled = e.target.checked;
    showSaveIndicator();
    await saveSettings();
  });
  
  // Notification toggle
  document.getElementById('notifToggle').addEventListener('change', async (e) => {
    currentSettings.notifications.enabled = e.target.checked;
    showSaveIndicator();
    await saveSettings();
  });
  
  // Message templates
  document.getElementById('completedMsg').addEventListener('input', async (e) => {
    currentSettings.notifications.completedMessage = e.target.value;
    showSaveIndicator();
    await saveSettings();
  });
  
  document.getElementById('failedMsg').addEventListener('input', async (e) => {
    currentSettings.notifications.failedMessage = e.target.value;
    showSaveIndicator();
    await saveSettings();
  });
  
  // Filter settings with debounce
  let filterTimeout;
  const saveFilters = () => {
    currentSettings.filters.excludedDomains = document.getElementById('excludedDomains')
      .value.split('\n').map(d => d.trim()).filter(d => d);
    currentSettings.filters.excludedPatterns = document.getElementById('excludedPatterns')
      .value.split('\n').map(p => p.trim()).filter(p => p);
    currentSettings.filters.allowedExtensions = document.getElementById('allowedExtensions')
      .value.split('\n').map(e => e.trim().replace(/^\./, '')).filter(e => e);
    currentSettings.filters.minFileSize = parseInt(document.getElementById('minFileSize').value) || 0;
    saveSettings();
  };
  
  ['excludedDomains', 'excludedPatterns', 'allowedExtensions'].forEach(id => {
    document.getElementById(id).addEventListener('input', () => {
      clearTimeout(filterTimeout);
      filterTimeout = setTimeout(saveFilters, 500);
    });
  });
  
  document.getElementById('minFileSize').addEventListener('change', saveFilters);
  
  // Schedule settings
  document.getElementById('scheduleToggle').addEventListener('change', async (e) => {
    currentSettings.schedule.enabled = e.target.checked;
    showSaveIndicator();
    await saveSettings();
  });
  
  ['startTime', 'endTime'].forEach(id => {
    document.getElementById(id).addEventListener('change', async () => {
      currentSettings.schedule.startTime = document.getElementById('startTime').value;
      currentSettings.schedule.endTime = document.getElementById('endTime').value;
      showSaveIndicator();
      await saveSettings();
    });
  });
  
  // Clear history
  document.getElementById('clearHistory').addEventListener('click', async () => {
    if (confirm('Clear download history?')) {
      await chrome.runtime.sendMessage({ action: 'clearHistory' });
      loadHistory();
    }
  });
}

// ==================== Settings Save/Load ====================
async function saveSettings() {
  try {
    // Don't save customFile or fileName to settings (they're stored separately)
    const settingsToSave = JSON.parse(JSON.stringify(currentSettings));
    for (const key of Object.keys(settingsToSave.sounds)) {
      delete settingsToSave.sounds[key].customFile;
      delete settingsToSave.sounds[key].fileName;
    }
    await chrome.storage.local.set({ settings: settingsToSave });
  } catch (error) {
    console.error('Error saving settings:', error);
  }
}

// ==================== History ====================
async function loadHistory() {
  try {
    const history = await chrome.runtime.sendMessage({ action: 'getHistory' });
    renderHistory(history || []);
  } catch (error) {
    console.error('Error loading history:', error);
  }
}

function renderHistory(history) {
  const container = document.getElementById('downloadHistory');
  
  // Helper functions
  function getEventClass(eventType) {
    if (eventType === 'download_completed' || eventType === 'completed') return 'completed';
    if (eventType === 'download_failed' || eventType === 'failed') return 'failed';
    if (eventType === 'download_cancelled' || eventType === 'cancelled') return 'cancelled';
    if (eventType === 'download_interrupted' || eventType === 'interrupted') return 'interrupted';
    if (eventType === 'download_erased' || eventType === 'erased') return 'erased';
    return 'interrupted'; // default
  }
  
  function getEventIcon(eventType) {
    const cls = getEventClass(eventType);
    if (cls === 'completed') return '\u2713';
    if (cls === 'failed') return '\u2715';
    if (cls === 'cancelled') return '\u2298';
    return '!';
  }
  
  function formatEventType(eventType) {
    // Return the full event type name for display
    if (eventType === 'download_completed' || eventType === 'completed') return 'Download completed';
    if (eventType === 'download_failed' || eventType === 'failed') return 'Download failed';
    if (eventType === 'download_cancelled' || eventType === 'cancelled') return 'Download cancelled';
    if (eventType === 'download_interrupted' || eventType === 'interrupted') return 'Download interrupted';
    if (eventType === 'download_erased' || eventType === 'erased') return 'Download erased';
    if (eventType === 'download_started' || eventType === 'started') return 'Download started';
    return eventType;
  }
  
  if (!history || history.length === 0) {
    container.textContent = '';
    const p = document.createElement('p');
    p.style.color = '#999';
    p.style.textAlign = 'center';
    p.style.padding = '20px';
    p.textContent = 'No download events yet';
    container.appendChild(p);
    return;
  }
  
  container.replaceChildren();
  
  history.slice(0, 50).forEach(entry => {
    const eventType = entry.eventType || 'download_completed';
    const time = new Date(entry.timestamp);
    const timeStr = time.toLocaleString();
    
    const item = document.createElement('div');
    item.className = 'history-item';
    
    const icon = document.createElement('div');
    icon.className = 'history-icon ' + getEventClass(eventType);
    icon.textContent = getEventIcon(eventType);
    
    const info = document.createElement('div');
    info.className = 'history-info';
    
    const filenameEl = document.createElement('div');
    filenameEl.className = 'history-filename';
    filenameEl.textContent = entry.filename || 'Unknown';
    
    const metaEl = document.createElement('div');
    metaEl.className = 'history-meta';
    metaEl.textContent = formatEventType(eventType) + ' \u00b7 ' + formatFileSize(entry.fileSize) + ' \u00b7 ' + timeStr;
    
    info.appendChild(filenameEl);
    info.appendChild(metaEl);
    item.appendChild(icon);
    item.appendChild(info);
    
    container.appendChild(item);
  });
}

// ==================== Utilities ====================
let saveIndicatorTimeout = null;

function showSaveIndicator() {
  let indicator = document.getElementById('saveIndicator');
  if (!indicator) {
    indicator = document.createElement('div');
    indicator.id = 'saveIndicator';
    indicator.textContent = '✓ Settings saved';
    document.body.appendChild(indicator);
  }
  
  // Clear any existing timeout to prevent rapid-change display issues
  if (saveIndicatorTimeout) {
    clearTimeout(saveIndicatorTimeout);
  }
  
  indicator.classList.add('show');
  saveIndicatorTimeout = setTimeout(() => {
    indicator.classList.remove('show');
    saveIndicatorTimeout = null;
  }, 1500);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}