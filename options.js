// Saves options to browser.storage
function saveOptions(e) {
    e.preventDefault();
    browser.storage.sync.set({
        defaultType: document.getElementById('defaultType').value,
        defaultLocation: document.getElementById('defaultLocation').value
    }).then(() => {
        // Update status to let user know options were saved
        const status = document.getElementById('status');
        status.classList.add('visible');
        setTimeout(() => {
            status.classList.remove('visible');
        }, 2000);
    });
}

// Restores preferences stored in browser.storage
function restoreOptions() {
    browser.storage.sync.get({
        defaultType: '',
        defaultLocation: ''
    }).then((items) => {
        document.getElementById('defaultType').value = items.defaultType;
        document.getElementById('defaultLocation').value = items.defaultLocation;
    });
}

// Reset options to defaults
function resetOptions(e) {
    e.preventDefault();

    document.getElementById('defaultType').value = '';
    document.getElementById('defaultLocation').value = '';

    saveOptions(e);
}

document.addEventListener('DOMContentLoaded', restoreOptions);
document.getElementById('save').addEventListener('click', saveOptions);
document.getElementById('reset').addEventListener('click', resetOptions);
