// Track backtick key presses for double-tap detection
let lastBacktickPressTime = 0;
const doubleTapThreshold = 500; // milliseconds

// Track active element for autocomplete
let activeElement = null;
// Track cursor position for inline completions
let cursorPosition = null;
// Track if we're currently processing a completion
let processingCompletion = false;
// Track if we should ignore the next input event (for completion protection)
let ignoreNextInput = false;

// Listen for all keydown events to properly handle backtick detection and deletion
document.addEventListener('keydown', async (event) => {
	// Only proceed if backtick key is pressed
	if (event.key === '`') {
		const currentTime = new Date().getTime();
		
		// Check if this is a double-tap of the backtick key
		if (currentTime - lastBacktickPressTime < doubleTapThreshold) {
			console.log("[AI-Autocomplete] Double backtick detected");
			
			// Get the active element (should be a text input)
			activeElement = document.activeElement;
			
			// Only proceed if the active element is a text input
			if (isTextInput(activeElement)) {
				// Prevent the default backtick behavior
				event.preventDefault();
				
				// Set flag to indicate we're processing a completion
				processingCompletion = true;
				
				// Store cursor position before deleting the backtick
				if (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA') {
					cursorPosition = activeElement.selectionStart;
					console.log(`[AI-Autocomplete] Initial cursor position: ${cursorPosition}`);
					console.log(`[AI-Autocomplete] Full text: "${activeElement.value}"`);
				} else if (activeElement.isContentEditable) {
					const selection = window.getSelection();
					if (selection.rangeCount > 0) {
						cursorPosition = selection.getRangeAt(0).startOffset;
						console.log(`[AI-Autocomplete] Initial cursor position (contentEditable): ${cursorPosition}`);
					}
				}
				
				// Delete the previously typed backtick at the cursor position
				deleteBacktickAtCursor(activeElement);
				
				// Get the text content after backtick deletion
				const text = getInputText(activeElement);
				console.log(`[AI-Autocomplete] Text after backtick deletion: "${text}"`);
				
				// Calculate the adjusted cursor position (after backtick deletion)
				const adjustedCursorPosition = (cursorPosition !== null) ? Math.max(0, cursorPosition - 1) : null;
				console.log(`[AI-Autocomplete] Adjusted cursor position: ${adjustedCursorPosition}`);
				
				// Check if the cursor is after a period
				let isAfterPeriod = false;
				if (adjustedCursorPosition > 0 && text.length > 0) {
					const charBeforeCursor = text.charAt(adjustedCursorPosition - 1);
					isAfterPeriod = charBeforeCursor === '.';
					console.log(`[AI-Autocomplete] Character before cursor: "${charBeforeCursor}"`);
					console.log(`[AI-Autocomplete] Is after period: ${isAfterPeriod}`);
				}
				
				// For debugging, show the text before and after cursor
				if (adjustedCursorPosition !== null) {
					const textBeforeCursor = text.substring(0, adjustedCursorPosition);
					const textAfterCursor = text.substring(adjustedCursorPosition);
					console.log(`[AI-Autocomplete] Text before cursor: "${textBeforeCursor}"`);
					console.log(`[AI-Autocomplete] Text after cursor: "${textAfterCursor}"`);
				}
				
				// Send message to background script to get completion
				browser.runtime.sendMessage({
					action: 'getCompletion',
					text: text,
					cursorPosition: adjustedCursorPosition,
					isAfterPeriod: isAfterPeriod
				}).then(response => {
					if (response && response.completion) {
						console.log(`[AI-Autocomplete] Received completion: "${response.completion}"`);
						
						// Insert the completion directly into the DOM in an undoable way at the cursor position
						insertCompletionUndoable(activeElement, response.completion, isAfterPeriod);
					} else {
						console.log("[AI-Autocomplete] No completion received or empty completion");
					}
					// Reset processing flag
					processingCompletion = false;
				}).catch(error => {
					console.error('[AI-Autocomplete] Error getting completion:', error);
					processingCompletion = false;
				});
			}
		}
		
		// Update the last backtick press time
		lastBacktickPressTime = currentTime;
	}
});

// Function to delete the backtick at the current cursor position
function deleteBacktickAtCursor(element) {
	if (!element) return;
	
	if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
		// For standard input elements
		const currentValue = element.value;
		const curPos = element.selectionStart;
		
		console.log(`[AI-Autocomplete] Attempting to delete backtick at position ${curPos}`);
		console.log(`[AI-Autocomplete] Character at position ${curPos-1}: "${currentValue.charAt(curPos-1)}"`);
		
		if (curPos > 0 && currentValue.charAt(curPos - 1) === '`') {
			// Focus the element to ensure it's the active element for undo history
			element.focus();
			
			// Select just the backtick character
			element.setSelectionRange(curPos - 1, curPos);
			
			// Delete it using execCommand for undo support
			document.execCommand('delete', false, null);
			
			// Restore cursor position (now one character back due to deletion)
			element.setSelectionRange(curPos - 1, curPos - 1);
			
			console.log(`[AI-Autocomplete] Backtick deleted, new cursor position: ${curPos-1}`);
		} else {
			console.log(`[AI-Autocomplete] No backtick found at position ${curPos-1}`);
		}
	} else if (element.isContentEditable) {
		// For contenteditable elements
		const selection = window.getSelection();
		if (selection.rangeCount > 0) {
			const range = selection.getRangeAt(0);
			
			// Check if we're in a text node and if the previous character is a backtick
			if (range.startContainer.nodeType === Node.TEXT_NODE && range.startOffset > 0) {
				const textContent = range.startContainer.textContent;
				console.log(`[AI-Autocomplete] ContentEditable text: "${textContent}"`);
				console.log(`[AI-Autocomplete] Character before cursor: "${textContent.charAt(range.startOffset-1)}"`);
				
				if (textContent.charAt(range.startOffset - 1) === '`') {
					// Create a range that selects just the backtick
					const charRange = range.cloneRange();
					charRange.setStart(range.startContainer, range.startOffset - 1);
					charRange.setEnd(range.startContainer, range.startOffset);
					
					// Delete the selected backtick using execCommand for undo support
					selection.removeAllRanges();
					selection.addRange(charRange);
					document.execCommand('delete', false, null);
					
					// Restore the original selection position (now one character back)
					const newRange = document.createRange();
					newRange.setStart(range.startContainer, range.startOffset - 1);
					newRange.setEnd(range.startContainer, range.startOffset - 1);
					selection.removeAllRanges();
					selection.addRange(newRange);
					
					console.log(`[AI-Autocomplete] ContentEditable backtick deleted`);
				} else {
					console.log(`[AI-Autocomplete] ContentEditable no backtick found`);
				}
			}
		}
	}
}

// Helper function to find the last text node in a container
function findLastTextNode(container) {
	if (!container) return null;
	
	if (container.nodeType === Node.TEXT_NODE) {
		return container;
	}
	
	// Traverse the container's children in reverse order
	for (let i = container.childNodes.length - 1; i >= 0; i--) {
		const child = container.childNodes[i];
		const textNode = findLastTextNode(child);
		if (textNode) {
			return textNode;
		}
	}
	
	return null;
}

// Insert completion in a way that supports Ctrl+Z (undo)
function insertCompletionUndoable(element, completion, isAfterPeriod) {
	if (!element || !completion) return;
	
	console.log(`[AI-Autocomplete] Inserting completion: "${completion}"`);
	console.log(`[AI-Autocomplete] Stored cursor position: ${cursorPosition}`);
	console.log(`[AI-Autocomplete] Is after period: ${isAfterPeriod}`);
	
	// If cursor is after a period and the completion doesn't start with a space, add one
	if (isAfterPeriod && !completion.startsWith(' ')) {
		completion = ' ' + completion;
		console.log(`[AI-Autocomplete] Added space after period. New completion: "${completion}"`);
	}
	
	// Set flag to ignore the next input event
	ignoreNextInput = true;
	
	if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
		// For standard input elements, use execCommand for undo support
		
		// Focus the element to ensure it's the active element for undo history
		element.focus();
		
		// Get current selection - use the stored cursor position if available
		// Adjust for the deleted backtick
		const selPos = (cursorPosition !== null) ? Math.max(0, cursorPosition - 1) : element.selectionStart;
		console.log(`[AI-Autocomplete] Insertion position: ${selPos}`);
		
		// Use the Selection API and execCommand for better undo support
		element.setSelectionRange(selPos, selPos);
		document.execCommand('insertText', false, completion);
		
		// Set the cursor position after the inserted completion
		const newPosition = selPos + completion.length;
		element.selectionStart = element.selectionEnd = newPosition;
		
		console.log(`[AI-Autocomplete] New cursor position after insertion: ${newPosition}`);
		console.log(`[AI-Autocomplete] Final text: "${element.value}"`);
		
		// Reset cursor position
		cursorPosition = null;
	} else if (element.isContentEditable) {
		// For contenteditable elements
		const selection = window.getSelection();
		if (selection.rangeCount > 0) {
			console.log(`[AI-Autocomplete] ContentEditable insertion`);
			
			// Use execCommand for undo support
			document.execCommand('insertText', false, completion);
			
			// Focus the element
			element.focus();
			
			// Reset cursor position
			cursorPosition = null;
			
			console.log(`[AI-Autocomplete] ContentEditable insertion complete`);
		}
	}
	
	// Reset the ignore flag after a short delay
	setTimeout(() => {
		ignoreNextInput = false;
	}, 10);
}

// Check if an element is a text input
function isTextInput(element) {
	if (!element) return false;
	
	// Check for input elements with text-like types
	if (element.tagName === 'INPUT') {
		const type = element.type.toLowerCase();
		return type === 'text' || type === 'search' || type === 'url' || 
					 type === 'email' || type === 'password' || type === '';
	}
	
	// Check for textarea elements
	if (element.tagName === 'TEXTAREA') {
		return true;
	}
	
	// Check for contenteditable elements
	if (element.isContentEditable) {
		return true;
	}
	
	return false;
}

// Get text from the input element
function getInputText(element) {
	if (!element) return '';
	
	let text = '';
	if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
		text = element.value;
	} else if (element.isContentEditable) {
		text = element.textContent;
	}
	
	console.log(`[AI-Autocomplete] getInputText: "${text}"`);
	return text;
}

// Add input event listener to handle completion protection
document.addEventListener('input', (event) => {
	// If we should ignore this input event (because we just inserted a completion)
	if (ignoreNextInput) {
		return;
	}
	
	// If we're processing a completion, prevent any input changes
	if (processingCompletion && event.target === activeElement) {
		// Prevent the default behavior
		event.preventDefault();
		event.stopPropagation();
		return false;
	}
});
