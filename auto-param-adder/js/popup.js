// DOM Elements
const paramInput = document.getElementById('paramInput');
const addBtn = document.getElementById('addBtn');
const paramsList = document.getElementById('paramsList');
const statusMessage = document.getElementById('statusMessage');
const extensionToggle = document.getElementById('extensionToggle');

// Load extension state and parameters
function loadExtensionState() {
    chrome.storage.local.get(['enabled', 'params'], (result) => {
        const enabled = result.enabled !== undefined ? result.enabled : true;
        const params = result.params || [];
        
        extensionToggle.checked = enabled;
        displayParams(params);
        
        console.log('[auto-param-adder][POPUP]: Extension state loaded - enabled:', enabled);
    });
}

// Toggle extension on/off
extensionToggle.addEventListener('change', async () => {
    const enabled = extensionToggle.checked;
    
    chrome.storage.local.set({ enabled }, () => {
        console.log('[auto-param-adder][POPUP]: Extension toggled - enabled:', enabled);
        
        if (enabled) {
            showStatus('Extension enabled - Refreshing page...', 'success');
            
            // Notify background script
            chrome.runtime.sendMessage({ action: 'extensionToggled', enabled: true });
            
            // Refresh the current tab after a short delay
            setTimeout(() => {
                chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                    if (tabs[0]) {
                        chrome.tabs.reload(tabs[0].id);
                    }
                });
            }, 500);
        } else {
            showStatus('Extension disabled', 'success');
            
            // Notify background script
            chrome.runtime.sendMessage({ action: 'extensionToggled', enabled: false });
        }
    });
});

// Load and display parameters
function loadParams() {
    chrome.storage.local.get(['params'], (result) => {
        const params = result.params || [];
        displayParams(params);
    });
}

// Display parameters
function displayParams(params) {
    if (params.length === 0) {
        paramsList.innerHTML = `
    <div class="empty-state">
        <span class="material-icons">link_off</span>
        <p>No parameters added yet<br>Add a parameter to get started</p>
    </div>
    `;
        return;
    }

    paramsList.innerHTML = '';
    params.forEach((param, index) => {
        const paramItem = createParamElement(param, index);
        paramsList.appendChild(paramItem);
    });
}

// Create parameter element
function createParamElement(param, index) {
    const div = document.createElement('div');
    div.className = 'param-item';

    const text = document.createElement('span');
    text.className = 'param-text';
    text.textContent = param;

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn-delete';
    deleteBtn.innerHTML = '<span class="material-icons">delete</span>';
    deleteBtn.title = 'Delete';
    deleteBtn.addEventListener('click', () => deleteParam(index, div));

    div.appendChild(text);
    div.appendChild(deleteBtn);

    return div;
}

// Add parameter
addBtn.addEventListener('click', addParam);
paramInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        addParam();
    }
});

function addParam() {
    const value = paramInput.value.trim();

    if (!value) {
        showStatus('Please enter a parameter', 'error');
        return;
    }

    // Check for spaces around the equals sign
    if (value.includes(' = ') || value.includes(' =') || value.includes('= ')) {
        showStatus('No spaces allowed around "=" - Format: key=value', 'error');
        return;
    }

    // Check for any spaces in the parameter
    if (value.includes(' ')) {
        showStatus('No spaces allowed - Format: key=value', 'error');
        return;
    }

    // Validate format
    if (!value.includes('=')) {
        showStatus('Format: key=value', 'error');
        return;
    }

    const parts = value.split('=');

    // Check if there's more than one equals sign
    if (parts.length > 2) {
        showStatus('Only one "=" allowed - Format: key=value', 'error');
        return;
    }

    const [key, val] = parts;

    if (!key || val === undefined || val === '') {
        showStatus('Both key and value required - Format: key=value', 'error');
        return;
    }

    chrome.storage.local.get(['params'], (result) => {
        const params = result.params || [];

        // Check if parameter already exists
        if (params.includes(value)) {
            showStatus('Parameter already exists', 'error');
            return;
        }

        params.push(value);
        chrome.storage.local.set({ params }, () => {
            loadParams();
            paramInput.value = '';
            showStatus('Parameter added successfully', 'success');

            // Notify background script to update
            chrome.runtime.sendMessage({ action: 'paramsUpdated' });
        });
    });
}

// Delete parameter
function deleteParam(index, element) {
    element.classList.add('removing');

    setTimeout(() => {
        chrome.storage.local.get(['params'], (result) => {
            const params = result.params || [];
            params.splice(index, 1);
            chrome.storage.local.set({ params }, () => {
                loadParams();
                showStatus('Parameter deleted', 'success');

                // Notify background script to update
                chrome.runtime.sendMessage({ action: 'paramsUpdated' });
            });
        });
    }, 200);
}

// Show status message
function showStatus(message, type) {
    statusMessage.textContent = message;
    statusMessage.className = type;

    setTimeout(() => {
        statusMessage.textContent = '';
        statusMessage.className = '';
    }, 3000);
}

// Initialize
loadExtensionState();