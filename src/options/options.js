
document.addEventListener('DOMContentLoaded', restoreOptions);
document.getElementById('save').addEventListener('click', saveOptions);
document.getElementById('reset').addEventListener('click', resetOptions);

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

function restoreOptions() {
    browser.storage.sync.get({
        defaultType: ''
    }).then((items) => {
        document.getElementById('defaultType').value = items.defaultType;
    });
}

function resetOptions(e) {
    e.preventDefault();
    document.getElementById('defaultType').value = '';
    saveOptions(e);
}

