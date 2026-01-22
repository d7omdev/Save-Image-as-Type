var workAsContent, contentPort, listened, handleMessages;

if (!listened) {
  init();
  listened = true;
}

function init() {
  handleMessages = async (message) => {
    let { op, target, filename, src, type } = message;
    if (target !== "offscreen" && target !== "content") {
      return false;
    }
    if (contentPort) {
      contentPort.disconnect();
      contentPort = null;
    }
    if (!src || !src.startsWith("data:")) {
      notify("Unexpected src");
      return false;
    }
    switch (op) {
      case "convertType":
        convertImageAsType(src, filename, type);
        break;
      case "copyToClipboard":
        copyImageToClipboard(src, type);
        break;
      case "download":
        if (!workAsContent) {
          notify("Cannot download on offscreen");
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

  browser.runtime.onConnect.addListener((port) => {
    if (port.name == "convertType") {
      workAsContent = true;
      contentPort = port;
      port.onMessage.addListener(handleMessages);
    }
  });
}

// Send notification to background script or show alert in content script
function notify(message) {
  // Handle error objects properly
  let displayMessage = message;
  if (typeof message === 'object' && message !== null) {
    if (message.error) {
      displayMessage = message.error;
      if (message.src) {
        displayMessage += '\n' + message.src;
      }
    } else {
      // Fallback for other object types
      displayMessage = JSON.stringify(message);
    }
  }

  if (workAsContent) {
    alert(displayMessage);
  } else {
    browser.runtime.sendMessage({
      op: "notify",
      target: "background",
      message: displayMessage,
    });
  }
}

// Handle the download process
function download(url, filename) {
  if (workAsContent) {
    let a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      if (url.startsWith("blob:")) {
        URL.revokeObjectURL(url); // Clean up blob URLs only
      }
    }, 100);
  } else {
    browser.runtime.sendMessage({
      op: "download",
      target: "background",
      url,
      filename,
    });
  }
}

// Convert the image to the requested type
function convertImageAsType(src, filename, type) {
  function getDataURLOfType(img, type) {
    var canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    var context = canvas.getContext("2d");
    var mimeType = "image/" + (type == "jpg" ? "jpeg" : type);
    context.drawImage(img, 0, 0);
    var dataurl = canvas.toDataURL(mimeType);
    canvas = null;
    return dataurl;
  }

  function imageLoad(src, type, callback) {
    var img = new Image();
    img.onload = function () {
      var dataurl = getDataURLOfType(this, type);
      callback(dataurl);
    };
    img.onerror = function () {
      notify({ error: "errorOnLoading", src });
    };
    img.src = src;
  }

  function callback(dataurl) {
    download(dataurl, filename);
  }

  if (!src.startsWith("data:")) {
    // This shouldn't happen as we validate in handleMessages
  } else {
    imageLoad(src, type, callback);
  }
}

// Copy image to clipboard
function copyImageToClipboard(src, type) {
  function getBlobOfType(img, type) {
    var canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    var context = canvas.getContext("2d");
    var mimeType = "image/" + (type == "jpg" ? "jpeg" : type);
    context.drawImage(img, 0, 0);

    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        canvas = null;
        if (blob && blob.size > 0) {
          resolve(blob);
        } else {
          reject(new Error("Failed to create blob from canvas"));
        }
      }, mimeType);
    });
  }

  async function imageLoad(src, type) {
    var img = new Image();

    img.onerror = function () {
      notify("Error loading image for clipboard");
      console.error("Image load error for src:", src);
    };

    img.onload = async function () {
      console.log("Image loaded for clipboard, type:", type);

      try {
        // Check if clipboard API is available
        if (!navigator.clipboard || !navigator.clipboard.write) {
          throw new Error("Clipboard API not available in this context");
        }

        const blob = await getBlobOfType(this, type);
        console.log("Blob created:", blob.type, blob.size, "bytes");

        const mimeType = "image/" + (type == "jpg" ? "jpeg" : type);

        // Check if ClipboardItem supports this MIME type
        // WebP and JPEG may not be supported in all browsers for clipboard
        const supportedTypes = ['image/png', 'image/jpeg', 'image/webp'];

        try {
          // Try to write with the requested type first
          const clipboardItem = new ClipboardItem({
            [mimeType]: blob
          });

          await navigator.clipboard.write([clipboardItem]);
          console.log("Clipboard write successful with type:", mimeType);
          notify("Image copied successfully!");

        } catch (clipboardError) {
          console.warn("Failed with type", mimeType, "- error:", clipboardError);

          // If WebP or JPG failed, fall back to PNG which is universally supported
          if (type !== 'png') {
            console.log("Falling back to PNG for clipboard");
            const pngBlob = await getBlobOfType(this, 'png');
            const pngClipboardItem = new ClipboardItem({
              'image/png': pngBlob
            });

            await navigator.clipboard.write([pngClipboardItem]);
            console.log("Clipboard write successful with PNG fallback");
            notify("Image copied successfully as PNG (fallback)");
          } else {
            throw clipboardError;
          }
        }

      } catch (error) {
        console.error("Clipboard copy failed:", error);
        const errorMsg = "Failed to copy image: " + (error.message || "Unknown error");
        notify(errorMsg);
      }
    };

    img.src = src;
  }

  if (!src.startsWith("data:")) {
    notify("Invalid image source for clipboard");
    console.error("Invalid src for clipboard:", src);
  } else {
    imageLoad(src, type);
  }
}
