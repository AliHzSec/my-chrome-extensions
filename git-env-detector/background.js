const checkedTargets = new Set();
let extensionEnabled = true;
let gitCheckEnabled = true;
let envCheckEnabled = true;
let foundItems = [];

// Track tab URLs to detect changes
const tabUrls = new Map();

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['extensionEnabled', 'gitCheckEnabled', 'envCheckEnabled', 'foundItems'], (data) => {
    extensionEnabled = data.extensionEnabled !== undefined ? data.extensionEnabled : true;
    gitCheckEnabled = data.gitCheckEnabled !== undefined ? data.gitCheckEnabled : true;
    envCheckEnabled = data.envCheckEnabled !== undefined ? data.envCheckEnabled : true;
    foundItems = data.foundItems || [];
    updateBadge();
  });
});

chrome.storage.onChanged.addListener((changes) => {
  if (changes.extensionEnabled) {
    extensionEnabled = changes.extensionEnabled.newValue;
    updateBadge();
  }
  if (changes.gitCheckEnabled) {
    gitCheckEnabled = changes.gitCheckEnabled.newValue;
  }
  if (changes.envCheckEnabled) {
    envCheckEnabled = changes.envCheckEnabled.newValue;
  }
  if (changes.foundItems) {
    foundItems = changes.foundItems.newValue;
  }
});

// This fires BEFORE navigation starts - catches original URL
chrome.webNavigation.onBeforeNavigate.addListener((details) => {
  if (!extensionEnabled) return;
  
  if (details.frameId === 0) {
    try {
      const url = new URL(details.url);
      if (url.protocol === 'http:' || url.protocol === 'https:') {
        checkTarget(url);
      }
    } catch (e) {}
  }
});

// This fires for EACH step including redirects
chrome.webNavigation.onCommitted.addListener((details) => {
  if (!extensionEnabled) return;
  
  if (details.frameId === 0) {
    try {
      const url = new URL(details.url);
      if (url.protocol === 'http:' || url.protocol === 'https:') {
        checkTarget(url);
        
        // Store URL for this tab
        tabUrls.set(details.tabId, details.url);
      }
    } catch (e) {}
  }
});

// Track ALL URL changes in tabs
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!extensionEnabled) return;
  
  // Check if URL changed
  if (changeInfo.url && changeInfo.url !== tabUrls.get(tabId)) {
    try {
      const url = new URL(changeInfo.url);
      if (url.protocol === 'http:' || url.protocol === 'https:') {
        checkTarget(url);
        tabUrls.set(tabId, changeInfo.url);
      }
    } catch (e) {}
  }
  
  // Also check on complete
  if (changeInfo.status === 'complete' && tab.url) {
    try {
      const url = new URL(tab.url);
      if (url.protocol === 'http:' || url.protocol === 'https:') {
        checkTarget(url);
        tabUrls.set(tabId, tab.url);
      }
    } catch (e) {}
  }
});

// Clean up closed tabs
chrome.tabs.onRemoved.addListener((tabId) => {
  tabUrls.delete(tabId);
});

function getTargetKey(scheme, hostname) {
  return `${scheme}://${hostname}`;
}

function isAlreadyFound(targetKey) {
  return foundItems.some(item => item.target === targetKey);
}

async function checkTarget(url) {
  const scheme = url.protocol.replace(':', '');
  const hostname = url.hostname;
  const targetKey = getTargetKey(scheme, hostname);
  
  if (checkedTargets.has(targetKey) || isAlreadyFound(targetKey)) {
    return;
  }
  
  checkedTargets.add(targetKey);
  
  const baseUrl = `${scheme}://${hostname}`;
  
  if (gitCheckEnabled) {
    await checkGitConfig(baseUrl, targetKey);
  }
  
  if (envCheckEnabled) {
    await checkEnvFile(baseUrl, targetKey);
  }
}

async function checkGitConfig(baseUrl, targetKey) {
  const gitUrl = `${baseUrl}/.git/config`;
  
  console.log('[GIT]', gitUrl);
  
  try {
    const response = await fetch(gitUrl, {
      method: 'GET',
      headers: {
        'Origin': baseUrl,
        'X-Forwarded-For': '127.0.0.1',
        'Cookie': 'PHPSESSID=TEST',
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36'
      },
      credentials: 'omit'
    });
    
    if (response.status === 200) {
      const text = await response.text();
      const lowerText = text.toLowerCase();
      
      const gitPatterns = [
        /\[gc/,
        /\[core/,
        /\[user/,
        /\[http/,
        /\[remote/,
        /\[branch/,
        /\[credentials/
      ];
      
      const hasGitPattern = gitPatterns.some(pattern => pattern.test(text));
      const hasHtml = lowerText.includes('<html') || lowerText.includes('<body');
      
      if (hasGitPattern && !hasHtml) {
        addFoundItem(targetKey, 'git', gitUrl, null);
      }
    }
  } catch (e) {}
}

async function checkEnvFile(baseUrl, targetKey) {
  const envUrl = `${baseUrl}/.env`;
  
  console.log('[ENV]', envUrl);
  
  try {
    const response = await fetch(envUrl, {
      method: 'GET',
      headers: {
        'Origin': baseUrl,
        'X-Forwarded-For': '127.0.0.1',
        'Cookie': 'PHPSESSID=TEST',
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36'
      },
      credentials: 'omit'
    });
    
    if (response.status === 200) {
      const text = await response.text();
      const envPattern = /^[a-zA-Z_][a-zA-Z0-9_]*\s*=|^[#\n\r ][\s\S]*^[a-zA-Z_][a-zA-Z0-9_]*\s*=/m;
      
      if (envPattern.test(text)) {
        addFoundItem(targetKey, 'env', envUrl, null);
      }
    }
  } catch (e) {}
}



function addFoundItem(target, type, url, secrets) {
  const item = {
    id: Date.now(),
    target: target,
    type: type,
    url: url,
    secrets: secrets,
    timestamp: new Date().toISOString()
  };
  
  foundItems.push(item);
  chrome.storage.local.set({ foundItems });
  
  showNotification(type, target, url);
  updateBadge();
}

function showNotification(type, target, url) {
  const typeLabel = type === 'git' ? '.git/config' : '.env';
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: `${typeLabel} Exposed!`,
    message: `Found on: ${url}`,
    priority: 2
  });
}

function updateBadge() {
  if (!extensionEnabled) {
    chrome.action.setBadgeText({ text: 'OFF' });
    chrome.action.setBadgeBackgroundColor({ color: '#666666' });
  } else {
    const count = foundItems.length;
    chrome.action.setBadgeText({ text: count > 0 ? count.toString() : '' });
    chrome.action.setBadgeBackgroundColor({ color: '#dc3545' });
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getFoundItems') {
    sendResponse({ foundItems });
  } else if (request.action === 'removeItem') {
    foundItems = foundItems.filter(item => item.id !== request.itemId);
    chrome.storage.local.set({ foundItems });
    
    checkedTargets.delete(request.target);
    
    updateBadge();
    sendResponse({ success: true });
  } else if (request.action === 'clearAll') {
    foundItems = [];
    chrome.storage.local.set({ foundItems });
    checkedTargets.clear();
    updateBadge();
    sendResponse({ success: true });
  }
  return true;
});