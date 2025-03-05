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

// Send notification to background script or show alert in content script
function notify(message) {
    if (workAsContent) {
        alert(message);
    } else {
        browser.runtime.sendMessage({ op: 'notify', target: 'background', message });
    }
}

// Handle the download process
function download(url, filename) {
    if (workAsContent) {
        let a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);  // Clean up
        }, 100);
    } else {
        browser.runtime.sendMessage({ op: 'download', target: 'background', url, filename });
    }
}

// Convert the image to the requested type
function convertImageAsType(src, filename, type) {
    // Create a canvas to convert the image
    function getDataURLOfType(img, type) {
        var canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        var context = canvas.getContext('2d');

        // Use appropriate mime type
        var mimeType = 'image/' + (type === 'jpg' ? 'jpeg' : type);

        // For JPEG, use a quality setting
        var quality = type === 'jpg' ? 0.9 : undefined;

        // Draw the image
        context.drawImage(img, 0, 0);

        // Get data URL with quality setting if applicable
        return canvas.toDataURL(mimeType, quality);
    }

    // Load the image and handle conversion
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

    // Start the conversion process
    imageLoad(src, type, (dataurl) => download(dataurl, filename));
}
