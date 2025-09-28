// Simplified DotGit background script - focused on detection only

const DEFAULT_OPTIONS = {
    "functions": {
        "git": true,
        "env": false
    },
    "max_sites": 100,
    "notification": {
        "new_git": true
    },
    "debug": false
};

const EXTENSION_ICON = {
    "48": "icons/dotgit-48.png",
    "96": "icons/dotgit-96.png"
};

let extensionEnabled = true;
let currentOptions = DEFAULT_OPTIONS;
let processingUrls = new Set();
let debug = false;

function debugLog(...args) {
    if (debug) {
        console.log('[DotGit Debug]', ...args);
    }
}

// Notification function
function showNotification(title, message) {
    if (!currentOptions.notification.new_git) {
        return;
    }

    chrome.notifications.create({
        type: "basic",
        iconUrl: chrome.runtime.getURL(EXTENSION_ICON["48"]),
        title: title,
        message: message
    });
}

// Set badge count
async function setBadge() {
    try {
        const result = await chrome.storage.local.get(["withExposedGit"]);
        if (typeof chrome.action !== "undefined" && typeof chrome.action.setBadgeText !== "undefined") {
            const count = (result.withExposedGit || []).length;
            const text = count > 0 ? count.toString() : "";
            await chrome.action.setBadgeText({ text });

            // Set badge color to green
            await chrome.action.setBadgeBackgroundColor({ color: "#4ade80" });
        }
    } catch (error) {
        debugLog('setBadge - Error:', error);
    }
}

// Initialize extension
chrome.runtime.onInstalled.addListener(async (details) => {
    if (details.reason === 'install' || details.reason === 'update') {
        debugLog('Extension installed/updated');

        await chrome.storage.local.set({
            withExposedGit: [],
            options: DEFAULT_OPTIONS,
            extensionEnabled: true
        });

        showNotification("DotGit Activated!", "Extension is ready to scan for exposed repositories.");
    }
});

// Load settings on startup
chrome.storage.local.get(["options", "extensionEnabled"], function (result) {
    currentOptions = result.options || DEFAULT_OPTIONS;
    extensionEnabled = result.extensionEnabled !== false;
    debug = currentOptions.debug;

    debugLog('Extension started with options:', currentOptions);
    debugLog('Extension enabled:', extensionEnabled);

    setBadge();
});

// Handle messages from popup and content scripts
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    debugLog('Received message:', msg.type);

    if (msg.type === "FINDINGS_FOUND") {
        handleFindings(msg.data, sendResponse);
        return true;
    }

    if (msg.type === "extension_toggle") {
        extensionEnabled = msg.enabled;
        debugLog('Extension toggled:', extensionEnabled);
        sendResponse({ status: true });
        return false;
    }

    if (msg.type === "update_badge") {
        setBadge();
        sendResponse({ status: true });
        return false;
    }

    if (msg.type === "delete_site") {
        deleteSite(msg.url, sendResponse);
        return true;
    }

    // Handle function toggles - Only git, env, debug
    const functionHandlers = {
        'git': () => currentOptions.functions.git = msg.value,
        'env': () => currentOptions.functions.env = msg.value,
        'debug': () => debug = msg.value
    };

    if (functionHandlers[msg.type]) {
        functionHandlers[msg.type]();
        debugLog(`Updated ${msg.type} to:`, msg.value);
        sendResponse({ status: true });
        return false;
    }

    return false;
});

// Delete single site function
async function deleteSite(url, sendResponse) {
    try {
        const result = await chrome.storage.local.get(["withExposedGit"]);
        const sites = result.withExposedGit || [];
        const updatedSites = sites.filter(site => site.url !== url);

        await chrome.storage.local.set({ withExposedGit: updatedSites });
        await setBadge();

        sendResponse({ status: true });
    } catch (error) {
        debugLog('Error deleting site:', error);
        sendResponse({ status: false, error: error.message });
    }
}

// Handle findings from content script
async function handleFindings(data, sendResponse) {
    try {
        const result = await chrome.storage.local.get(["withExposedGit"]);
        let withExposedGit = result.withExposedGit || [];
        const origin = data.url;
        let updatedList = false;
        let newFindings = [];

        for (const type of data.types) {
            // Check if we already have this finding
            if (!withExposedGit.some(item => item.url === origin && item.type === type)) {
                const pathMap = {
                    'git': '/.git/',
                    'env': '/.env'
                };

                withExposedGit.push({
                    type: type,
                    url: origin,
                    foundAt: origin + pathMap[type],
                    timestamp: Date.now()
                });

                updatedList = true;
                newFindings.push({ type, url: origin });
            }
        }

        // Limit the number of stored sites
        if (withExposedGit.length > currentOptions.max_sites) {
            withExposedGit = withExposedGit.slice(-currentOptions.max_sites);
        }

        if (updatedList) {
            await chrome.storage.local.set({ withExposedGit });
            await setBadge();

            // Show notification for new findings
            if (newFindings.length > 0) {
                const typeNames = {
                    'git': 'Git repository',
                    'env': 'Environment file'
                };

                const title = newFindings.length === 1
                    ? `${typeNames[newFindings[0].type]} found!`
                    : 'Multiple exposures found!';

                const message = newFindings.length === 1
                    ? `Found at: ${newFindings[0].url}`
                    : `Found ${newFindings.length} exposures at: ${origin}`;

                showNotification(title, message);
            }
        }

        sendResponse({ status: true });
    } catch (error) {
        debugLog('Error processing findings:', error);
        sendResponse({ status: false, error: error.message });
    }
}

// Web request listener for detecting page loads
chrome.webRequest.onCompleted.addListener(
    details => processWebRequest(details),
    { urls: ["<all_urls>"] }
);

async function processWebRequest(details) {
    if (!extensionEnabled) {
        return;
    }

    const origin = new URL(details.url).origin;

    if (processingUrls.has(origin)) {
        return;
    }

    try {
        processingUrls.add(origin);

        const result = await chrome.storage.local.get(["options"]);
        const options = result.options || DEFAULT_OPTIONS;

        // Wait for the tab to be ready
        const tabs = await chrome.tabs.query({ url: details.url });
        if (tabs.length === 0) return;

        const tab = tabs[0];

        try {
            // Check if content script is already injected
            const isContentScriptAvailable = await new Promise(resolve => {
                chrome.tabs.sendMessage(tab.id, { type: "PING" }, response => {
                    resolve(!chrome.runtime.lastError);
                });
            });

            if (!isContentScriptAvailable) {
                await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    files: ['content_script.js']
                });
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            // Send check request to content script
            await chrome.tabs.sendMessage(tab.id, {
                type: "CHECK_SITE",
                url: origin,
                options: options
            });
        } catch (error) {
            debugLog('Error injecting content script or sending message:', error);
        }
    } catch (error) {
        debugLog('Error in processWebRequest:', error);
    } finally {
        processingUrls.delete(origin);
    }
}

// Storage change listener
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local') {
        if (changes.options) {
            currentOptions = changes.options.newValue;
            debug = currentOptions.debug;
            debugLog('Options updated:', currentOptions);
        }
        if (changes.extensionEnabled) {
            extensionEnabled = changes.extensionEnabled.newValue;
            debugLog('Extension enabled state changed:', extensionEnabled);
        }
        if (changes.withExposedGit) {
            setBadge();
        }
    }
});