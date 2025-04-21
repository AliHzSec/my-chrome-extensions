document.addEventListener('DOMContentLoaded', function () {
    const rtlToggle = document.getElementById('rtl-toggle');

    chrome.storage.sync.get('rtlEnabled', function (result) {
        rtlToggle.checked = result.rtlEnabled !== false;
    });

    rtlToggle.addEventListener('change', function () {
        chrome.storage.sync.set({ rtlEnabled: rtlToggle.checked });
    });
});