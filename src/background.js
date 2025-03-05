let messages;
let userPreferences = {
    defaultType: '',
    defaultLocation: ''
};

if (!browser.i18n?.getMessage) {
    browser.i18n = browser.i18n || {};
    browser.i18n.getMessage = (key, args) => {
        const messages = {
            'View_in_store': 'View in store',
            'Save_as': args?.[0] ? `Save as ${args[0]}` : key,
            'Save_image_as': 'Save image as type >'
        };
        return messages[key] || key;
    };
}

function loadUserPreferences() {
    return browser.storage.sync.get({
        defaultType: '',
    }).then(items => {
        userPreferences = items;
        updateContextMenus();
    });
}

function download(url, filename) {
    browser.downloads.download({
        url: url,
        saveAs: true,
        filename: filename
    });
}

async function fetchAsDataURL(src, callback) {
    if (src.startsWith('')) {
        callback(null, src);
        return;
    }
    try {
        const res = await fetch(src);
        const blob = await res.blob();
        if (!blob.size) throw 'Fetch failed of 0 size';
        const reader = new FileReader();
        reader.onload = evt => callback(null, evt.target.result);
        reader.readAsDataURL(blob);
    } catch (error) {
        callback(error.message || error);
    }
}

function getSuggestedFilename(src, type) {
    if (/googleusercontent\.com\/[0-9a-zA-Z]{30,}/.test(src)) return `screenshot.${type}`;
    if (src.startsWith('blob:') || src.startsWith('')) return `Untitled.${type}`;
    let filename = decodeURIComponent(src.replace(/[?#].*/, '').replace(/.*[\/]/, '').replace(/\+/g, ' '));
    filename = filename.replace(/[\x00-\x7f]+/g, s => s.replace(/[^\w\-\.\,@ ]+/g, ''))
        .replace(/\.[^0-9a-z]*\./g, '.')
        .replace(/\s\s+/g, ' ')
        .trim()
        .replace(/\.(jpe?g|png|gif|webp|svg)$/gi, '')
        .trim();
    if (filename.length > 32) filename = filename.substr(0, 32);
    filename = filename.replace(/[^0-9a-z]+$/i, '').trim();
    return (filename || 'image') + `.${type}`;
}

function notify(msg) {
    if (msg.error) {
        msg = `${browser.i18n.getMessage(msg.error) || msg.error}\n${msg.srcUrl || msg.src}`;
    }
}

function loadMessages() {
    if (!messages) {
        messages = {};
        ['errorOnSaving', 'errorOnLoading', 'errorIsNotImage'].forEach(key => {
            messages[key] = browser.i18n.getMessage(key);
        });
    }
    return messages;
}

async function hasOffscreenDocument(path) {
    try {
        const offscreenUrl = browser.runtime.getURL(path);
        const matchedClients = await clients.matchAll();
        return matchedClients.some(client => client.url === offscreenUrl);
    } catch (err) {
        return false;
    }
}

function updateContextMenus() {
    browser.contextMenus.removeAll().then(() => {
        if (userPreferences.defaultType) {
            // Default type is selected: show a single menu item
            const defaultTypeUpper = userPreferences.defaultType.toUpperCase();
            browser.contextMenus.create({
                id: 'save_as_default',
                title: browser.i18n.getMessage("Save_as", [defaultTypeUpper]),
                contexts: ["image"],
                type: "normal",
            });
        } else {
            // No default type: show "Save image as type >" with submenus
            const parentId = browser.contextMenus.create({
                id: 'save_image_as',
                title: browser.i18n.getMessage("Save_image_as"),
                contexts: ["image"],
                type: "normal"
            });

            ['JPG', 'PNG', 'WebP'].forEach(type => {
                const typeId = type.toLowerCase();
                browser.contextMenus.create({
                    id: `save_as_${typeId}`,
                    parentId: parentId,
                    title: type.toUpperCase(),
                    contexts: ["image"],
                    type: "normal"
                });
            });

            // Add separator
            browser.contextMenus.create({
                id: "sep_1",
                type: "separator",
                parentId: parentId,
                contexts: ["image"]
            });

            // Add "Options" and "View in store" under the parent menu
            browser.contextMenus.create({
                id: "open_options",
                parentId: parentId,
                title: browser.i18n.getMessage("Options"),
                contexts: ["image"],
                type: "normal"
            });

            browser.contextMenus.create({
                id: "view_in_store",
                parentId: parentId,
                title: browser.i18n.getMessage("View_in_store"),
                contexts: ["image"],
                type: "normal"
            });
        }
    });
}

browser.runtime.onInstalled.addListener(() => {
    loadMessages();
    loadUserPreferences();
});

browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.defaultType) {
        userPreferences.defaultType = changes.defaultType.newValue;
        updateContextMenus();
    }
});

browser.runtime.onMessage.addListener((message, _sender, _sendResponse) => {
    const { target, op } = message || {};
    if (target === 'background' && op) {
        if (op === 'download') {
            const { url, filename } = message;
            download(url, filename);
        } else if (op === 'notify') {
            const msg = message.message;
            if (msg && msg.error) {
                let msg2 = browser.i18n.getMessage(msg.error) || msg.error;
                if (msg.src) msg2 += `\n${msg.src}`;
                notify(msg2);
            } else {
                notify(message);
            }
        } else {
            console.warn(`unknown op: ${op}`);
        }
    }
});

browser.contextMenus.onClicked.addListener(async (info, tab) => {
    const { menuItemId, mediaType, srcUrl } = info;

    if (menuItemId === 'save_as_default') {
        if (mediaType === 'image' && srcUrl) {
            const type = userPreferences.defaultType;
            processImageSave(srcUrl, type, tab, info);
        } else {
            notify(browser.i18n.getMessage("errorIsNotImage"));
        }
    } else if (menuItemId.startsWith('save_as_')) {
        if (mediaType === 'image' && srcUrl) {
            const type = menuItemId.replace('save_as_', '');
            processImageSave(srcUrl, type, tab, info);
        } else {
            notify(browser.i18n.getMessage("errorIsNotImage"));
        }
    } else if (menuItemId === 'open_options') {
        browser.runtime.openOptionsPage();
    } else if (menuItemId === 'view_in_store') {
        const url = `https://addons.mozilla.org/firefox/addon/siat/`;
        browser.tabs.create({ url, index: tab.index + 1 });
    }
});

function connectTab(tab, frameId) {
    return browser.tabs.connect(tab.id, { name: 'convertType', frameId });
}

async function processImageSave(srcUrl, type, tab, info) {
    const filename = getSuggestedFilename(srcUrl, type);
    loadMessages();
    const noChange = srcUrl.startsWith(`image/${type === 'jpg' ? 'jpeg' : type};`);

    try {
        if (browser.offscreen) {
            fetchAsDataURL(srcUrl, async (error, dataurl) => {
                if (error) {
                    notify({ error, srcUrl });
                    return;
                }

                if (noChange) {
                    download(dataurl, filename);
                    return;
                }

                const offscreenSrc = 'offscreen.html';
                if (!(await hasOffscreenDocument(offscreenSrc))) {
                    await browser.offscreen.createDocument({
                        url: browser.runtime.getURL(offscreenSrc),
                        reasons: ['DOM_SCRAPING'],
                        justification: 'Download an image for user',
                    });
                }

                await browser.runtime.sendMessage({
                    op: 'convertType',
                    target: 'offscreen',
                    src: dataurl,
                    type,
                    filename
                });
            });
        } else {
            const frameIds = info.frameId ? [info.frameId] : undefined;

            await browser.scripting.executeScript({
                target: { tabId: tab.id, frameIds },
                files: ["offscreen.js"],
            });

            fetchAsDataURL(srcUrl, async (error, dataurl) => {
                if (error) {
                    notify({ error, srcUrl });
                    return;
                }

                const port = connectTab(tab, info.frameId);
                await port.postMessage({
                    op: noChange ? 'download' : 'convertType',
                    target: 'content',
                    src: dataurl,
                    type,
                    filename
                });
            });
        }
    } catch (error) {
        notify({ error: error.message || 'Unknown error', srcUrl });
    }
}
