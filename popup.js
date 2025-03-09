// Event listeners for popup buttons
document.addEventListener('DOMContentLoaded', () => {
	// Options button - open options page
	document.getElementById('optionsBtn').addEventListener('click', () => {
		browser.runtime.openOptionsPage();
	});
	
	// Test API button - test the Gemini API with current key
	document.getElementById('testBtn').addEventListener('click', () => {
		testApiKey();
	});
	
	// Check if API key is set
	checkApiKey();
});

// Test the Gemini API with the current key
function testApiKey() {
	const statusElement = document.getElementById('api-status');
	statusElement.textContent = 'Testing API connection...';
	statusElement.className = 'status';
	statusElement.style.display = 'block';
	
	// Send test message to background script
	browser.runtime.sendMessage({
		action: 'getCompletion',
		text: 'Reply with simply "OK", nothing more and nothing less.'
	}).then(response => {
		if (response.error) {
			showApiStatus('API Error: ' + response.error, 'error');
		} else if (response.completion) {
			showApiStatus('API connection successful!', 'success');
		} else {
			showApiStatus('Unknown response from API', 'error');
		}
	}).catch(error => {
		showApiStatus('Error: ' + error.message, 'error');
	});
}

// Check if API key is set
function checkApiKey() {
	browser.storage.local.get('geminiApiKey').then(result => {
		const statusText = document.getElementById('status-text');
		if (!result.geminiApiKey) {
			statusText.textContent = 'No API key set';
			statusText.style.color = '#990000';
		} else {
			statusText.textContent = 'Active';
			statusText.style.color = '#006600';
		}
	}).catch(error => {
		console.error('Error checking API key:', error);
	});
}

// Show API status message
function showApiStatus(message, type) {
	const statusElement = document.getElementById('api-status');
	statusElement.textContent = message;
	statusElement.className = 'status ' + type;
	statusElement.style.display = 'block';
}
