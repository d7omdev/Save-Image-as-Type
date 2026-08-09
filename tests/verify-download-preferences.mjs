import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const downloads = [];
let storageChangeListener;

const browser = {
	contextMenus: {
		create() {},
		onClicked: { addListener() {} },
		removeAll: () => Promise.resolve(),
	},
	downloads: {
		download(options, callback) {
			downloads.push(options);
			callback(1);
		},
	},
	i18n: {
		getMessage(key) {
			return key;
		},
	},
	runtime: {
		lastError: null,
		onInstalled: { addListener() {} },
		onMessage: { addListener() {} },
	},
	storage: {
		onChanged: {
			addListener(listener) {
				storageChangeListener = listener;
			},
		},
		sync: {
			get: () => Promise.resolve({}),
		},
	},
	tabs: {
		create() {},
	},
};

const context = vm.createContext({
	Blob,
	URL,
	Uint8Array,
	atob,
	browser,
	console,
	setTimeout,
});

const source = readFileSync(
	new URL("../src/background.js", import.meta.url),
	"utf8",
);
vm.runInContext(source, context, { filename: "src/background.js" });

function download(url, filename) {
	vm.runInContext(
		`download(${JSON.stringify(url)}, ${JSON.stringify(filename)})`,
		context,
	);
	return downloads.at(-1);
}

assert.equal(
	download("https://example.com/image.png", "image.png").saveAs,
	true,
	"downloads should open the save dialog by default",
);

storageChangeListener(
	{ saveSilently: { oldValue: false, newValue: true } },
	"sync",
);

assert.equal(
	download("https://example.com/image.png", "image.png").saveAs,
	false,
	"silent downloads should skip the save dialog",
);

storageChangeListener(
	{ saveSilently: { oldValue: true, newValue: false } },
	"sync",
);

assert.equal(
	download("https://example.com/image.png", "image.png").saveAs,
	true,
	"disabling silent downloads should restore the save dialog",
);

console.log("Download preference checks passed.");
