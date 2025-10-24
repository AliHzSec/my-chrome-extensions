// This script runs before everything else and overrides the History API

(function() {
    'use strict';

    // Check if extension is enabled
    let isEnabled = true;
    
    chrome.storage.local.get(['enabled'], (result) => {
        isEnabled = result.enabled !== undefined ? result.enabled : true;
    });

    // Listen to extension toggle
    chrome.storage.onChanged.addListener((changes) => {
        if (changes.enabled) {
            isEnabled = changes.enabled.newValue;
        }
        if (changes.params) {
            params = changes.params.newValue || [];
        }
    });

    // Get parameters from storage
    let params = [];

    // Request parameters from background
    chrome.storage.local.get(['params'], (result) => {
        params = result.params || [];
    });

    // Function to add parameters to URL
    function addParamsToUrl(url) {
        // Check if extension is enabled first
        if (!isEnabled) {
            return url;
        }

        if (params.length === 0) {
            return url;
        }

        try {
            // Handle relative URLs
            let urlObj;
            if (url && url.startsWith('/')) {
                urlObj = new URL(url, window.location.origin);
            } else if (url && url.startsWith('http')) {
                urlObj = new URL(url);
            } else if (url) {
                urlObj = new URL(url, window.location.href);
            } else {
                // If no URL provided, use current location
                urlObj = new URL(window.location.href);
            }
            
            let modified = false;
            params.forEach(param => {
                const [key, value] = param.split('=');
                if (key && value !== undefined) {
                    // Only add if parameter doesn't exist
                    if (!urlObj.searchParams.has(key)) {
                        urlObj.searchParams.set(key, value);
                        modified = true;
                    }
                }
            });

            // Return the appropriate format
            if (url && url.startsWith('/')) {
                // For relative URLs, return path + search + hash
                const finalUrl = urlObj.pathname + urlObj.search + urlObj.hash;
                return finalUrl;
            } else if (url && url.startsWith('http')) {
                // For absolute URLs
                const finalUrl = urlObj.toString();
                return finalUrl;
            } else {
                // For other cases
                const finalUrl = urlObj.pathname + urlObj.search + urlObj.hash;
                return finalUrl;
            }
        } catch (e) {
            return url;
        }
    }

    // Save original History API references
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    // Override pushState
    history.pushState = function(state, title, url) {
        if (!isEnabled) {
            return originalPushState.call(this, state, title, url);
        }

        const modifiedUrl = addParamsToUrl(url);
        return originalPushState.call(this, state, title, modifiedUrl);
    };

    // Override replaceState
    history.replaceState = function(state, title, url) {
        if (!isEnabled) {
            return originalReplaceState.call(this, state, title, url);
        }

        const modifiedUrl = addParamsToUrl(url);
        return originalReplaceState.call(this, state, title, modifiedUrl);
    };

    // Intercept clicks EARLIER in capture phase with higher priority
    document.addEventListener('click', function(e) {
        if (!isEnabled) {
            return;
        }

        const link = e.target.closest('a');
        if (link && link.href) {
            // Get the current href
            const originalHref = link.href;
            const modifiedHref = addParamsToUrl(originalHref);
            
            if (modifiedHref !== originalHref) {
                // Prevent the default behavior
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                
                // Use pushState with our modified URL
                const url = new URL(modifiedHref);
                const targetPath = url.pathname + url.search + url.hash;
                
                history.pushState(null, '', targetPath);
                
                // Dispatch popstate event to notify the app
                window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
            }
        }
    }, true); // true = capture phase (runs BEFORE Instagram's handlers)

})();