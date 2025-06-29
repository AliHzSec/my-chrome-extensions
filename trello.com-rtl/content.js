(function () {
    // Precise selectors for Trello.com
    const SELECTORS = {
        // Message body elements - all consolidated into a single array
        messageSelectors: [
            '.sWixytUjIjyhqU',
            '.css-1g6xwps',
            '.Tt9w9y9sSmCNSj',
            '.ak-renderer-document',
            '.ibk99ptVTfUfda',
            '.ak-editor-content-area',
	    '.NdQKKfeqJDDdX3',
        ],
    };

    // Variable to store RTL state
    let rtlEnabled = true;

    // Regular expression to detect Persian characters
    const persianRegex = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

    // Function to check if text contains Persian characters
    function containsPersian(text) {
        return persianRegex.test(text);
    }

    // Load settings from storage
    chrome.storage.sync.get('rtlEnabled', function (result) {
        if (result.rtlEnabled !== undefined) {
            rtlEnabled = result.rtlEnabled;
        }

        // Initial RTL application based on settings
        applyRTL();

        // Add RTL toggle button
        addRTLButton();
    });

    // Function to apply or remove RTL
    function applyRTL() {
        if (rtlEnabled) {
            // Apply RTL only to elements with Persian text - using all selectors from the array
            SELECTORS.messageSelectors.forEach(selector => {
                document.querySelectorAll(selector).forEach(el => {
                    if (containsPersian(el.textContent)) {
                        el.setAttribute("dir", "rtl");
                        el.style.textAlign = "right";
                        el.style.paddingRight = "12px";
                    }
                });
            });

            // Apply RTL to user input area only when typing in Persian
            document.querySelectorAll(SELECTORS.inputArea).forEach(el => {
                // Add input event listener to detect language
                if (!el.hasAttribute('rtl-listener')) {
                    el.setAttribute('rtl-listener', 'true');
                    el.addEventListener('input', function () {
                        if (containsPersian(el.textContent)) {
                            el.setAttribute("dir", "rtl");
                            el.style.textAlign = "right";
                        } else {
                            el.removeAttribute("dir");
                            el.style.textAlign = "";
                        }
                    });
                }

                // Initial check
                if (containsPersian(el.textContent)) {
                    el.setAttribute("dir", "rtl");
                    el.style.textAlign = "right";
                }
            });
        } else {
            // Remove RTL from all elements - using all selectors from the array
            SELECTORS.messageSelectors.forEach(selector => {
                document.querySelectorAll(selector).forEach(el => {
                    el.removeAttribute("dir");
                    el.style.textAlign = "";
                    el.style.paddingRight = "";
                });
            });

            document.querySelectorAll(SELECTORS.inputArea).forEach(el => {
                el.removeAttribute("dir");
                el.style.textAlign = "";
            });
        }
    }

    // Add RTL toggle button
    function addRTLButton() {
        // Check if button already exists
        if (document.getElementById('rtl-toggle-btn')) return;

        // Create button
        const rtlButton = document.createElement('button');
        rtlButton.id = 'rtl-toggle-btn';
        rtlButton.innerText = 'RTL';
        rtlButton.style.cssText = `
            position: fixed;
            bottom: 120px;
            right: 20px;
            padding: 8px 12px;
            background-color: ${rtlEnabled ? '#3498db' : '#f1f1f1'};
            color: ${rtlEnabled ? 'white' : 'black'};
            border: none;
            border-radius: 6px;
            cursor: pointer;
            z-index: 10000;
            font-family: Arial, sans-serif;
            font-size: 14px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.2);
            `;

        // Add event listener
        rtlButton.addEventListener('click', function () {
            rtlEnabled = !rtlEnabled;

            // Save new settings
            chrome.storage.sync.set({ rtlEnabled });

            // Change button color
            rtlButton.style.backgroundColor = rtlEnabled ? '#3498db' : '#f1f1f1';
            rtlButton.style.color = rtlEnabled ? 'white' : 'black';

            // Apply settings
            applyRTL();
        });

        // Add button to page
        document.body.appendChild(rtlButton);
    }

    // Monitor DOM changes to apply RTL to new elements
    const observer = new MutationObserver(function (mutations) {
        if (rtlEnabled) {
            // Apply RTL to new messages containing Persian text - using all selectors from the array
            SELECTORS.messageSelectors.forEach(selector => {
                document.querySelectorAll(selector + ':not([dir="rtl"])').forEach(el => {
                    if (containsPersian(el.textContent)) {
                        el.setAttribute("dir", "rtl");
                        el.style.textAlign = "right";
                        el.style.paddingRight = "12px";
                    }
                });
            });

            // Apply RTL to user input area if it contains Persian text
            document.querySelectorAll(SELECTORS.inputArea + ':not([rtl-listener])').forEach(el => {
                el.setAttribute('rtl-listener', 'true');
                el.addEventListener('input', function () {
                    if (containsPersian(el.textContent)) {
                        el.setAttribute("dir", "rtl");
                        el.style.textAlign = "right";
                    } else {
                        el.removeAttribute("dir");
                        el.style.textAlign = "";
                    }
                });

                // Initial check
                if (containsPersian(el.textContent)) {
                    el.setAttribute("dir", "rtl");
                    el.style.textAlign = "right";
                }
            });
        }
    });

    // Start monitoring DOM changes
    observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: false
    });
})();
