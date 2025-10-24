// Cache for parameters to avoid repeated storage reads
let cachedParams = [];
let isEnabled = true;

// Load parameters from storage
async function loadParams() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['params', 'enabled'], (result) => {
            cachedParams = result.params || [];
            isEnabled = result.enabled !== undefined ? result.enabled : true;
            resolve(cachedParams);
        });
    });
}

// Initialize on install
chrome.runtime.onInstalled.addListener(() => {
    // Set default enabled state to true
    chrome.storage.local.set({ enabled: true }, () => {
        loadParams();
    });
});

// Update cache when parameters change
chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'paramsUpdated') {
        loadParams();
    }
    
    if (message.action === 'extensionToggled') {
        isEnabled = message.enabled;
    }
});

// Parse URL and check if parameter exists
function hasParam(url, key, value) {
    try {
        const urlObj = new URL(url);
        return urlObj.searchParams.get(key) === value;
    } catch (e) {
        return false;
    }
}

// Add parameters to URL
function addParamsToUrl(url, params) {
    if (params.length === 0) return url;

    try {
        const urlObj = new URL(url);
        let modified = false;

        params.forEach(param => {
            const [key, value] = param.split('=');
            if (key && value !== undefined) {
                if (!hasParam(url, key, value)) {
                    urlObj.searchParams.set(key, value);
                    modified = true;
                }
            }
        });

        return modified ? urlObj.toString() : url;
    } catch (e) {
        return url;
    }
}

// Handle URL update - only for traditional navigation
async function handleUrlUpdate(details) {
    // Check if extension is enabled
    if (!isEnabled) {
        return;
    }

    if (details.frameId !== 0) {
        return;
    }

    if (cachedParams.length === 0) {
        return;
    }

    const originalUrl = details.url;

    if (originalUrl.startsWith('chrome://') ||
        originalUrl.startsWith('chrome-extension://')) {
        return;
    }

    const newUrl = addParamsToUrl(originalUrl, cachedParams);

    if (newUrl !== originalUrl) {
        chrome.tabs.update(details.tabId, { url: newUrl });
    }
}

// Only for traditional page loads (fallback)
chrome.webNavigation.onBeforeNavigate.addListener(
    handleUrlUpdate,
    { url: [{ schemes: ['http', 'https'] }] }
);

// Load params on startup
loadParams();