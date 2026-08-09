document.addEventListener("DOMContentLoaded", restoreOptions);
document.getElementById("save").addEventListener("click", saveOptions);
document.getElementById("reset").addEventListener("click", resetOptions);

function showToast(message) {
	const toast = document.getElementById("toast");
	toast.textContent = message;
	toast.classList.add("visible");
	setTimeout(() => toast.classList.remove("visible"), 2000);
}

function saveOptions(e) {
	e.preventDefault();
	browser.storage.sync
		.set({
			defaultType: document.getElementById("defaultType").value,
			saveSilently: document.getElementById("saveSilently").checked,
			showStoreButton: document.getElementById("showStoreButton").checked,
		})
		.then(() => {
			showToast("Options saved!");
		});
}

function restoreOptions() {
	browser.storage.sync
		.get({
			defaultType: "",
			saveSilently: false,
			showStoreButton: false,
		})
		.then((items) => {
			document.getElementById("defaultType").value = items.defaultType;
			document.getElementById("saveSilently").checked = items.saveSilently;
			document.getElementById("showStoreButton").checked =
				items.showStoreButton;
		});
}

function resetOptions() {
	browser.storage.sync
		.set({
			defaultType: "",
			saveSilently: false,
			showStoreButton: false,
		})
		.then(() => {
			restoreOptions();
			showToast("Options reset!");
		});
}
