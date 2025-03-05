// Saves options to browser.storage
function saveOptions(e) {
    e.preventDefault();
    browser.storage.sync.set({
        defaultType: document.getElementById('defaultType').value
    }).then(() => {
        const status = document.getElementById('status');
        status.classList.add('visible');
        setTimeout(() => status.classList.remove('visible'), 2000);
    });
}

// Restores preferences
function restoreOptions() {
    browser.storage.sync.get({
        defaultType: ''
    }).then((items) => {
        document.getElementById('defaultType').value = items.defaultType;
    });
}

// Reset options
function resetOptions(e) {
    e.preventDefault();
    document.getElementById('defaultType').value = '';
    saveOptions(e);
}

document.addEventListener('DOMContentLoaded', restoreOptions);
document.getElementById('save').addEventListener('click', saveOptions);
document.getElementById('reset').addEventListener('click', resetOptions);
