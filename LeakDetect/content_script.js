// Simplified content script - focused on detection only

if (typeof window.dotGitInjected === 'undefined') {
    window.dotGitInjected = true;

    let debug = false;

    function debugLog(...args) {
        if (debug) {
            console.log('[DotGit]', ...args);
        }
    }
    debugLog("Content script initialized");

    // Paths to check - Only git and env
    const PATHS = {
        git: {
            head: "/.git/HEAD",
            config: "/.git/config"
        },
        env: "/.env"
    };

    // Expected headers/patterns
    const PATTERNS = {
        git: {
            head: {
                header: "ref: refs/heads/",
                regex: /[a-f0-9]{40}/
            },
            config: {
                patterns: [/\[gc/, /\[core/, /\[user/, /\[http/, /\[remote/, /\[branch/, /\[credentials/],
                excludeHtml: /<html|<body/i
            }
        },
        env: {
            regex: /^[A-Z_]+=|^[#\n\r ][\s\S]*^[A-Z_]+=/m
        }
    };

    // Fetch with timeout
    async function fetchWithTimeout(resource, options = {}) {
        const { timeout = 8000 } = options;

        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), timeout);

        try {
            const response = await fetch(resource, {
                ...options,
                signal: controller.signal
            });
            clearTimeout(id);
            return response;
        } catch (error) {
            clearTimeout(id);
            throw error;
        }
    }

    // Check for Git repository
    async function checkGit(url) {
        try {
            // Check .git/HEAD
            const headUrl = url + PATHS.git.head;
            debugLog('Checking Git HEAD:', headUrl);

            const headResponse = await fetchWithTimeout(headUrl, {
                redirect: "manual",
                timeout: 8000
            });

            if (headResponse.status === 200) {
                const headText = await headResponse.text();
                debugLog('Git HEAD content:', headText);

                if (headText.startsWith(PATTERNS.git.head.header) || PATTERNS.git.head.regex.test(headText)) {
                    debugLog('Git repository found via HEAD!');
                    return true;
                }
            }

            // Check .git/config
            const configUrl = url + PATHS.git.config;
            debugLog('Checking Git config:', configUrl);

            const configResponse = await fetchWithTimeout(configUrl, {
                redirect: "manual",
                timeout: 8000
            });

            if (configResponse.status === 200) {
                const configText = await configResponse.text();
                debugLog('Git config content:', configText);

                // Check if response contains HTML tags (exclude HTML responses)
                if (PATTERNS.git.config.excludeHtml.test(configText)) {
                    debugLog('Git config response contains HTML, skipping');
                    return false;
                }

                // Check for git config patterns
                const hasGitPattern = PATTERNS.git.config.patterns.some(pattern => pattern.test(configText));
                if (hasGitPattern) {
                    debugLog('Git repository found via config!');
                    return true;
                }
            }
        } catch (error) {
            debugLog('Error checking Git:', error);
        }

        return false;
    }

    // Check for .env file
    async function checkEnv(url) {
        const checkUrl = url + PATHS.env;

        try {
            const response = await fetchWithTimeout(checkUrl, {
                redirect: "manual",
                timeout: 8000
            });

            if (response.status === 200) {
                const text = await response.text();
                if (PATTERNS.env.regex.test(text)) {
                    return true;
                }
            }
        } catch (error) {
            debugLog('Error checking ENV:', error);
        }

        return false;
    }

    // Main site checking function
    async function checkSite(url, options) {
        try {
            debugLog('Starting site check for:', url);

            // Run checks based on enabled options
            const checks = [];

            if (options.functions.git) {
                checks.push(checkGit(url).then(result => ({ type: 'git', found: result })));
            }
            if (options.functions.env) {
                checks.push(checkEnv(url).then(result => ({ type: 'env', found: result })));
            }

            const results = await Promise.all(checks);
            debugLog('Check results:', results);

            const foundTypes = results.filter(result => result.found).map(result => result.type);

            if (foundTypes.length > 0) {
                debugLog('Found types:', foundTypes);

                // Send findings to background script
                chrome.runtime.sendMessage({
                    type: "FINDINGS_FOUND",
                    data: {
                        url: url,
                        types: foundTypes
                    }
                }, response => {
                    debugLog('Background response:', response);
                });
            }

            return {
                foundTypes,
                success: true
            };
        } catch (error) {
            debugLog('Error during checks:', error);
            return {
                foundTypes: [],
                success: false,
                error: error.message
            };
        }
    }

    // Listen for messages from background script
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        debugLog('Received message:', request);

        if (request.type === "CHECK_SITE") {
            const { url, options } = request;
            debug = options.debug;
            debugLog('Checking site:', url, 'with options:', options);

            checkSite(url, options).then((results) => {
                sendResponse(results);
            }).catch(error => {
                debugLog('Error during checks:', error);
                sendResponse({
                    foundTypes: [],
                    success: false,
                    error: error.message
                });
            });

            return true; // Keep the message channel open for async response
        }

        if (request.type === "PING") {
            sendResponse({ status: "OK" });
            return false;
        }
    });

    debugLog('Content script setup complete');
}