// Download Status Sound - Popup Script

document.addEventListener('DOMContentLoaded', () => {
  loadStatus();
  loadDownloads();
  setupEventListeners();
  
  // Update downloads every 2 seconds
  setInterval(loadDownloads, 2000);
});

async function loadStatus() {
  try {
    const settings = await chrome.runtime.sendMessage({ action: 'getSettings' });
    if (settings && typeof settings === 'object' && !Array.isArray(settings)) {
      document.getElementById('mainToggle').checked = settings.enabled !== false;
      document.getElementById('statusText').textContent = settings.enabled !== false ? 'Enabled' : 'Disabled';
    } else {
      // Default to enabled if no settings or invalid settings received
      document.getElementById('mainToggle').checked = true;
      document.getElementById('statusText').textContent = 'Enabled';
    }
  } catch (error) {
    console.error('Error loading status:', error);
  }
}

async function loadDownloads() {
  try {
    // Get progress data from background script which tracks receivedBytes
    const downloads = await chrome.runtime.sendMessage({ action: 'getDownloadProgress' });
    renderDownloads(downloads || []);
  } catch (error) {
    console.error('Error loading downloads:', error);
  }
}

function renderDownloads(downloads) {
  const container = document.getElementById('downloadItems');
  
  if (downloads.length === 0) {
    container.textContent = '';
    const msg = document.createElement('p');
    msg.className = 'empty-msg';
    msg.textContent = 'No active downloads';
    container.appendChild(msg);
    return;
  }
  
  container.replaceChildren();
  
  downloads.forEach(d => {
    const filename = d.filename || 'Unknown file';
    const totalBytes = d.totalBytes || 0;
    const receivedBytes = d.receivedBytes || 0;
    const progress = totalBytes > 0 ? Math.round((receivedBytes / totalBytes) * 100) : 0;
    
    const item = document.createElement('div');
    item.className = 'download-item';
    
    const nameEl = document.createElement('div');
    nameEl.className = 'download-filename';
    nameEl.title = filename;
    nameEl.textContent = filename;
    
    const progressContainer = document.createElement('div');
    progressContainer.className = 'progress-bar-container';
    
    const progressBar = document.createElement('div');
    progressBar.className = 'progress-bar';
    progressBar.style.width = Math.min(progress, 100) + '%';
    
    progressContainer.appendChild(progressBar);
    
    const info = document.createElement('div');
    info.className = 'download-info';
    
    const leftSpan = document.createElement('span');
    leftSpan.textContent = progress + '%';
    
    const rightSpan = document.createElement('span');
    rightSpan.textContent = formatFileSize(receivedBytes) + ' / ' + formatFileSize(totalBytes);
    
    info.appendChild(leftSpan);
    info.appendChild(rightSpan);
    
    item.appendChild(nameEl);
    item.appendChild(progressContainer);
    item.appendChild(info);
    
    container.appendChild(item);
  });
}

function setupEventListeners() {
  document.getElementById('mainToggle').addEventListener('change', async (e) => {
    try {
      // Save directly to storage rather than reading from background to avoid stale data
      const result = await chrome.storage.local.get('settings');
      
      if (result.settings && typeof result.settings === 'object' && !Array.isArray(result.settings)) {
        // Ensure settings is a valid object before modifying
        result.settings.enabled = e.target.checked;
        await chrome.storage.local.set({ settings: result.settings });
      } else {
        // No settings exist or settings is invalid, create default with the toggle value
        const defaultSettings = {
          enabled: e.target.checked,
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
        await chrome.storage.local.set({ settings: defaultSettings });
      }
      document.getElementById('statusText').textContent = e.target.checked ? 'Enabled' : 'Disabled';
    } catch (error) {
      console.error('Error toggling status:', error);
    }
  });
}

function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}