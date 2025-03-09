// Default API key (placeholder)
let apiKey = "";

// Listen for messages from the content script
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
	console.log("[AI-Autocomplete Background] Received message:", message);
	
	if (message.action === 'getCompletion') {
		getCompletion(message.text, message.cursorPosition, message.isAfterPeriod)
			.then(completion => {
				console.log(`[AI-Autocomplete Background] Sending completion: "${completion}"`);
				sendResponse({ completion });
			})
			.catch(error => {
				console.error('[AI-Autocomplete Background] Error in getCompletion:', error);
				sendResponse({ error: error.message });
			});
		return true; // Required for async response
	} else if (message.action === 'updateApiKey') {
		apiKey = message.apiKey;
		console.log('[AI-Autocomplete Background] API key updated');
		sendResponse({ success: true });
		return false;
	}
});

// Load API key from storage on startup
browser.storage.local.get('geminiApiKey').then(result => {
	if (result.geminiApiKey) {
		apiKey = result.geminiApiKey;
		console.log('[AI-Autocomplete Background] API key loaded from storage');
	} else {
		console.log('[AI-Autocomplete Background] No API key found in storage, using default placeholder');
	}
});

// Function to get text completion from Gemini API
async function getCompletion(text, cursorPosition, isAfterPeriod) {
	if (!text || text.trim() === '') {
		console.log('[AI-Autocomplete Background] Empty text, returning empty completion');
		return '';
	}

	try {
		// Gemini API endpoint - updated to use the correct model and API version
		const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
		
		// Determine if this is an inline completion (cursor is not at the end)
		const isInlineCompletion = cursorPosition !== undefined && cursorPosition !== null && cursorPosition < text.length;
		console.log(`[AI-Autocomplete Background] Is inline completion: ${isInlineCompletion}`);
		console.log(`[AI-Autocomplete Background] Cursor position: ${cursorPosition}`);
		console.log(`[AI-Autocomplete Background] Text length: ${text.length}`);
		console.log(`[AI-Autocomplete Background] Is after period: ${isAfterPeriod}`);
		
		// Split text into before and after cursor if this is an inline completion
		let textBeforeCursor = text;
		let textAfterCursor = '';
		
		if (isInlineCompletion) {
			textBeforeCursor = text.substring(0, cursorPosition);
			textAfterCursor = text.substring(cursorPosition);
			console.log(`[AI-Autocomplete Background] Text before cursor: "${textBeforeCursor}"`);
			console.log(`[AI-Autocomplete Background] Text after cursor: "${textAfterCursor}"`);
		} else {
			console.log(`[AI-Autocomplete Background] Using full text for completion (not inline): "${text}"`);
		}
		
		// Create an appropriate prompt based on whether this is an inline completion
		let promptText;
		if (isInlineCompletion) {
			promptText = `You are an intelligent text completion assistant. I will provide you with text that has a cursor position marked. Your task is to continue the text ONLY at the cursor position, maintaining coherence with both the text before and after the cursor.

Text before cursor: ${textBeforeCursor}
Text after cursor: ${textAfterCursor}

Provide ONLY the text that should be inserted at the cursor position. Do not repeat any part of the original text. Your completion should flow naturally between the text before and after the cursor. Keep it concise and contextually appropriate. The text you provide will be directly inserted between the "Text before cursor" and "Text after cursor", so make sure it connects them naturally. Do not add any line breaks or extra spaces at the beginning or end of your completion. Use single spaces between sentences, not double spaces.

You must ONLY provide a completion, not an answer or explanation. For example, if the provided text is a question, you should complete the question, not answer it.

Also, it's okay to write exceptionally short sentences or just finish a word if it makes sense.
Only complete ONE sentence, unless the provided text is already a full sentence, in which case you should write ONE new sentence to follow.

Completion:`;
		} else {
			promptText = `You are an intelligent text completion assistant. Continue the following text naturally, maintaining the style, tone, and context. Do not repeat the original text. Do not add unnecessary quotation marks, citations, or references. Just provide a natural continuation as if you were the original author. Do not add any line breaks or extra spaces at the beginning or end of your completion. Use single spaces between sentences, not double spaces.

Text to complete:
${text}

You must ONLY provide a completion, not an answer or explanation. For example, if the provided text is a question, you should complete the question, not answer it.

Also, it's okay to write exceptionally short sentences or just finish a word if it makes sense.
Only complete ONE sentence, unless the provided text is already a full sentence, in which case you should write ONE new sentence to follow.

Completion:`;
		}
		
		console.log(`[AI-Autocomplete Background] Using prompt: ${promptText.substring(0, 100)}...`);
		
		// Prepare the request payload with an improved prompt
		const payload = {
			contents: [
				{
					parts: [
						{
							text: promptText
						}
					]
				}
			],
			generationConfig: {
				temperature: 0.7,
				maxOutputTokens: 100,
				topP: 0.95,
				topK: 40
			}
		};
		
		console.log('[AI-Autocomplete Background] Sending request to Gemini API');
		
		// Make the API request
		const response = await fetch(endpoint, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(payload)
		});
		
		if (!response.ok) {
			const errorData = await response.json();
			console.error('[AI-Autocomplete Background] API error response:', errorData);
			throw new Error(`API error: ${errorData.error?.message || response.statusText}`);
		}
		
		const data = await response.json();
		console.log('[AI-Autocomplete Background] Received API response:', data);
		
		// Extract the completion text from the response
		if (data.candidates && data.candidates.length > 0 && 
				data.candidates[0].content && data.candidates[0].content.parts && 
				data.candidates[0].content.parts.length > 0) {
			// Clean up the response to remove any artifacts
			let completionText = data.candidates[0].content.parts[0].text;
			console.log(`[AI-Autocomplete Background] Raw completion: "${completionText}"`);
			
			// Remove "Completion:" if it appears at the beginning
			completionText = completionText.replace(/^Completion:\s*/i, '');
			
			// Remove any leading/trailing quotes that might have been added
			completionText = completionText.replace(/^["']|["']$/g, '');
			
			// Remove any leading/trailing whitespace including line breaks
			completionText = completionText.trim();
			
			// Specifically remove any trailing line breaks or carriage returns
			completionText = completionText.replace(/[\r\n]+$/, '');
			
			// Replace double spaces with single spaces
			completionText = completionText.replace(/\s{2,}/g, ' ');
			
			// For inline completions, check if the model is repeating the text after cursor
			if (isInlineCompletion && textAfterCursor) {
				// Check if the completion ends with the beginning of the text after cursor
				// This helps prevent duplication when the model repeats what comes after
				for (let i = 1; i <= Math.min(completionText.length, textAfterCursor.length); i++) {
					const completionSuffix = completionText.slice(-i);
					const afterCursorPrefix = textAfterCursor.slice(0, i);
					
					if (completionSuffix === afterCursorPrefix) {
						// Found duplication, remove it from completion
						completionText = completionText.slice(0, -i);
						console.log(`[AI-Autocomplete Background] Removed ${i} duplicated characters from completion`);
						break;
					}
				}
			}
			
			// Final check to ensure no line breaks at the end
			if (completionText.endsWith('\n') || completionText.endsWith('\r')) {
				console.log('[AI-Autocomplete Background] Removing trailing line break');
				completionText = completionText.replace(/[\r\n]+$/, '');
			}
			
			// Final check for double spaces
			completionText = completionText.replace(/\s{2,}/g, ' ');
			
			// If cursor is after a period, ensure the completion starts with a space
			// Note: We now handle this in the content script for better undo support
			
			console.log(`[AI-Autocomplete Background] Final cleaned completion: "${completionText}"`);
			return completionText;
		}
		
		console.log('[AI-Autocomplete Background] No valid completion found in response');
		return '';
	} catch (error) {
		console.error('[AI-Autocomplete Background] Error calling Gemini API:', error);
		throw error;
	}
}
