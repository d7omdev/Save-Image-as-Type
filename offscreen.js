var workAsContent, contentPort, listened, handleMessages;

if (!listened) {
    init();
    listened = true;
}

function init() {
    handleMessages = async (message) => {
        let { op, target, filename, src, type } = message;
        if (target !== 'offscreen' && target !== 'content') {
            return false;
        }
        if (contentPort) {
            contentPort.disconnect();
            contentPort = null;
        }
        if (!src || !src.startsWith('data:')) {
            notify('Unexpected src');
            return false;
        }
        switch (op) {
            case 'convertType':
                convertImageAsType(src, filename, type);
                break;
            case 'download':
                if (!workAsContent) {
                    notify('Cannot download on offscreen');
                    return false;
                }
                download(src, filename);
                break;
            default:
                console.warn(`Unexpected message type received: '${op}'.`);
                return false;
        }
    };

    browser.runtime.onMessage.addListener(handleMessages);

    browser.runtime.onConnect.addListener(port => {
        if (port.name == 'convertType') {
            workAsContent = true;
            contentPort = port;
            port.onMessage.addListener(handleMessages);
        }
    });
}

function notify(message) {
    if (workAsContent) {
        alert(message);
    } else {
        browser.runtime.sendMessage({ op: 'notify', target: 'background', message });
    }
}

function download(url, filename) {
    if (workAsContent) {
        let a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
    } else {
        browser.runtime.sendMessage({ op: 'download', target: 'background', url, filename });
    }
}

function convertImageAsType(src, filename, type) {
    function getDataURLOfType(img, type) {
        var canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        var context = canvas.getContext('2d');
        var mimeType = 'image/' + (type === 'jpg' ? 'jpeg' : type);
        context.drawImage(img, 0, 0);
        return canvas.toDataURL(mimeType);
    }
    function imageLoad(src, type, callback) {
        var img = new Image();
        img.onload = function () {
            callback(getDataURLOfType(this, type));
        };
        img.onerror = function () {
            notify({ error: 'errorOnLoading', src });
        };
        img.src = src;
    }
    imageLoad(src, type, (dataurl) => download(dataurl, filename));
}

