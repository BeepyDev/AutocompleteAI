// Save options to browser storage
function saveOptions() {
	const apiKey = document.getElementById('apiKey').value.trim();
	
	// Show error if API key is empty
	if (!apiKey) {
		showStatus('Please enter a valid API key', 'error');
		return;
	}
	
	// Save to storage
	browser.storage.local.set({
		geminiApiKey: apiKey
	}).then(() => {
		// Update the API key in the background script
		browser.runtime.sendMessage({
			action: 'updateApiKey',
			apiKey: apiKey
		}).then(() => {
			showStatus('Options saved successfully!', 'success');
		}).catch(error => {
			showStatus('Error updating API key: ' + error.message, 'error');
		});
	}).catch(error => {
		showStatus('Error saving options: ' + error.message, 'error');
	});
}

// Restore options from browser storage
function restoreOptions() {
	browser.storage.local.get('geminiApiKey').then(result => {
		if (result.geminiApiKey) {
			document.getElementById('apiKey').value = result.geminiApiKey;
		}
	}).catch(error => {
		console.error('Error loading options:', error);
	});
}

// Show status message
function showStatus(message, type) {
	const statusElement = document.getElementById('status');
	statusElement.textContent = message;
	statusElement.className = 'status ' + type;
	statusElement.style.display = 'block';
	
	// Hide the status message after 3 seconds
	setTimeout(() => {
		statusElement.style.display = 'none';
	}, 3000);
}

// Add event listeners
document.addEventListener('DOMContentLoaded', restoreOptions);
document.getElementById('saveBtn').addEventListener('click', saveOptions);
