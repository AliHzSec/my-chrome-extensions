// Modern popup.js with simplified functionality - Only git and env

document.addEventListener('DOMContentLoaded', function () {
    const extensionToggle = document.getElementById('extensionEnabled');
    const gitToggle = document.getElementById('gitToggle');
    const envToggle = document.getElementById('envToggle');
    const sitesList = document.getElementById('sitesList');

    let currentOptions = {};
    let extensionEnabled = true;

    // Load initial settings
    loadSettings();
    loadSites();

    // Event listeners for toggles
    extensionToggle.addEventListener('change', handleExtensionToggle);
    gitToggle.addEventListener('change', () => handleFunctionToggle('git', gitToggle.checked));
    envToggle.addEventListener('change', () => handleFunctionToggle('env', envToggle.checked));

    function loadSettings() {
        chrome.storage.local.get(['options', 'extensionEnabled'], function (result) {
            currentOptions = result.options || getDefaultOptions();
            extensionEnabled = result.extensionEnabled !== false; // Default to true

            // Set toggle states - Only git and env
            extensionToggle.checked = extensionEnabled;
            gitToggle.checked = currentOptions.functions.git;
            envToggle.checked = currentOptions.functions.env;

            // Update UI state
            updateUIState();
        });
    }

    function getDefaultOptions() {
        return {
            functions: {
                git: true,
                env: false
            },
            notification: {
                new_git: true
            },
            max_sites: 100,
            debug: false
        };
    }

    function handleExtensionToggle() {
        extensionEnabled = extensionToggle.checked;

        // Save extension state
        chrome.storage.local.set({ extensionEnabled: extensionEnabled });

        // Send message to background script
        chrome.runtime.sendMessage({
            type: 'extension_toggle',
            enabled: extensionEnabled
        });

        updateUIState();
    }

    function handleFunctionToggle(functionName, enabled) {
        currentOptions.functions[functionName] = enabled;

        // Save options
        chrome.storage.local.set({ options: currentOptions });

        // Send message to background script
        chrome.runtime.sendMessage({
            type: functionName,
            value: enabled
        });
    }

    function updateUIState() {
        const functionsSection = document.querySelector('.functions-section');
        const functionItems = document.querySelectorAll('.function-item');

        if (extensionEnabled) {
            functionsSection.style.opacity = '1';
            functionItems.forEach(item => {
                item.style.pointerEvents = 'auto';
            });
        } else {
            functionsSection.style.opacity = '0.5';
            functionItems.forEach(item => {
                item.style.pointerEvents = 'none';
            });
        }
    }

    function loadSites() {
        chrome.storage.local.get(['withExposedGit'], function (result) {
            const sites = result.withExposedGit || [];
            displaySites(sites);
        });
    }

    function displaySites(sites) {
        // Update counter in header
        updateVulnerabilitiesCounter(sites.length);

        if (sites.length === 0) {
            sitesList.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">
                        <i class="material-icons">search</i>
                    </div>
                    <div class="empty-state-text">No exposed repositories found yet.<br>Browse some websites to start scanning.</div>
                </div>
            `;
            return;
        }

        // Clear the list first
        sitesList.innerHTML = '';

        sites.slice(0, currentOptions.max_sites || 100).forEach((site, index) => {
            const types = Array.isArray(site.type) ? site.type : [site.type];
            const typeBadges = types.map(type =>
                `<span class="type-badge ${type}">${type}</span>`
            ).join('');

            const siteDiv = document.createElement('div');
            siteDiv.className = 'site-item';
            siteDiv.setAttribute('data-url', site.url);

            siteDiv.innerHTML = `
                <div class="site-info">
                    <div class="site-url">${site.url}</div>
                    <div class="site-types">${typeBadges}</div>
                </div>
                <div class="site-actions">
                    <button class="action-btn copy-btn" title="Copy URL">
                        <i class="material-icons">content_copy</i>
                    </button>
                    <button class="action-btn delete-btn" title="Delete">
                        <i class="material-icons">delete</i>
                    </button>
                </div>
            `;
            DotGit
            // Add event listener to copy button
            const copyBtn = siteDiv.querySelector('.copy-btn');
            copyBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                copyToClipboard(site.url);
            });

            // Add event listener to delete button
            const deleteBtn = siteDiv.querySelector('.delete-btn');
            deleteBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                deleteSite(site.url);
            });

            sitesList.appendChild(siteDiv);
        });
    }

    // Update vulnerabilities counter
    function updateVulnerabilitiesCounter(count) {
        const toolbarHeader = document.querySelector('.toolbar h2');
        if (toolbarHeader) {
            toolbarHeader.textContent = `Detected Vulnerabilities (${count})`;
        }
    }

    // Copy to clipboard function
    function copyToClipboard(url) {
        navigator.clipboard.writeText(url).then(() => {
            // Show brief visual feedback
            showCopyFeedback();
        }).catch(err => {
            console.error('Failed to copy text: ', err);
            // Fallback method
            const textArea = document.createElement('textarea');
            textArea.value = url;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            showCopyFeedback();
        });
    }

    // Show copy feedback
    function showCopyFeedback() {
        // Create temporary notification
        const notification = document.createElement('div');
        notification.className = 'copy-notification';
        notification.textContent = 'URL copied!';
        document.body.appendChild(notification);

        // Remove after animation
        setTimeout(() => {
            notification.remove();
        }, 2000);
    }

    // Delete site function - now local instead of global
    function deleteSite(url) {
        if (confirm('Are you sure you want to delete this site?')) {
            chrome.runtime.sendMessage({
                type: 'delete_site',
                url: url
            }, function (response) {
                if (response && response.status) {
                    loadSites(); // Reload the sites list
                } else {
                    console.error('Failed to delete site');
                }
            });
        }
    }

    // Listen for storage changes to update the list
    chrome.storage.onChanged.addListener(function (changes, namespace) {
        if (namespace === 'local' && changes.withExposedGit) {
            displaySites(changes.withExposedGit.newValue || []);
        }
    });
});