import { extension_settings, getContext, loadExtensionSettings } from "../../../extensions.js";
import { saveSettingsDebounced, eventSource, event_types, saveChatDebounced as coreSaveChatDebounced, messageFormatting as coreMessageFormatting } from "../../../../script.js"; // Import saveChatDebounced and messageFormatting
import { SlashCommand } from '../../../slash-commands/SlashCommand.js';
import { ARGUMENT_TYPE, SlashCommandArgument } from '../../../slash-commands/SlashCommandArgument.js';
import { SlashCommandParser } from '../../../slash-commands/SlashCommandParser.js';

// Extension configuration
const extensionName = "message-formatter";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;
const defaultSettings = {
    enabled: true,
    autoFormat: true,
    positiveReplacement: "!",  // Default positive punctuation
    negativeReplacement: "...", // Default negative punctuation
    neutralReplacement: ".",    // Default neutral punctuation
    positiveThreshold: 0.05,    // Default positive threshold
    negativeThreshold: -0.05,   // Default negative threshold
};

// Initialize extension settings and load existing or default values
function loadSettings() {
    extension_settings[extensionName] = extension_settings[extensionName] || {};
    if (Object.keys(extension_settings[extensionName]).length === 0) {
        Object.assign(extension_settings[extensionName], defaultSettings);
    }

    // Ensure settings exist before use in the UI
    $("#enable_formatter").prop("checked", extension_settings[extensionName].enabled).trigger("input");
    $("#auto_format").prop("checked", extension_settings[extensionName].autoFormat).trigger("input");
    $("#positive_replacement").val(extension_settings[extensionName].positiveReplacement);
    $("#negative_replacement").val(extension_settings[extensionName].negativeReplacement);
    $("#neutral_replacement").val(extension_settings[extensionName].neutralReplacement);
    $("#positive_threshold").val(extension_settings[extensionName].positiveThreshold);
    $("#negative_threshold").val(extension_settings[extensionName].negativeThreshold);
}

// Event handler for toggling the extension on or off
function onEnableFormatterChange(event) {
    extension_settings[extensionName].enabled = Boolean($(event.target).prop("checked"));
    saveSettingsDebounced();
}

// Event handler for toggling auto-format on or off
function onAutoFormatChange(event) {
    extension_settings[extensionName].autoFormat = Boolean($(event.target).prop("checked"));
    saveSettingsDebounced();
}

// Event Handlers to get the new settings
function onPositiveChange(event) {
    extension_settings[extensionName].positiveReplacement = $(event.target).val();
    saveSettingsDebounced();
}

function onNegativeChange(event) {
    extension_settings[extensionName].negativeReplacement = $(event.target).val();
    saveSettingsDebounced();
}

function onNeutralChange(event) {
    extension_settings[extensionName].neutralReplacement = $(event.target).val();
    saveSettingsDebounced();
}

function onPositiveThresholdChange(event) {
    const value = parseFloat($(event.target).val());
    if (!isNaN(value)) {
        extension_settings[extensionName].positiveThreshold = value;
        saveSettingsDebounced();
    }
}

function onNegativeThresholdChange(event) {
    const value = parseFloat($(event.target).val());
    if (!isNaN(value)) {
        extension_settings[extensionName].negativeThreshold = value;
        saveSettingsDebounced();
    }
}

function analyzeSentiment(text) {
    const positiveWords = ['good', 'great', 'happy', 'excited', 'wonderful', 'love', 'excellent', 'fantastic', 'amazing', 'joy'];
    const negativeWords = ['bad', 'sad', 'angry', 'upset', 'terrible', 'hate', 'awful', 'horrible', 'disappointing', 'miserable'];

    text = text.toLowerCase();
    let score = 0;

    // Count occurrences of positive words.
    positiveWords.forEach(word => {
        const regex = new RegExp(`\\b${word}\\b`, 'g'); // Match whole words only
        const matches = text.match(regex);
        if (matches) {
            score += matches.length * 0.1; // Add to the score for each match
        }
    });

    // Count occurrences of negative words.
    negativeWords.forEach(word => {
        const regex = new RegExp(`\\b${word}\\b`, 'g'); // Match whole words only
        const matches = text.match(regex);
        if (matches) {
            score -= matches.length * 0.1; // Subtract from the score for each match
        }
    });

    return {
        compound: score // Return the calculated compound sentiment score
    };
}

function formatDialoguePunctuation(dialogueText) {
    if (!dialogueText.endsWith(',')) {
        return dialogueText; // Return original if no trailing comma
    }

    const sentiment = analyzeSentiment(dialogueText);
    const settings = extension_settings[extensionName]; // Get settings
    let replacement = settings.neutralReplacement; // Default to neutral

    if (sentiment.compound > settings.positiveThreshold) {
        replacement = settings.positiveReplacement;
    } else if (sentiment.compound < settings.negativeThreshold) {
        replacement = settings.negativeReplacement;
    } else {
        replacement = settings.neutralReplacement;
    }

    return dialogueText.slice(0, -1) + replacement; // Replace the comma
}

// Main function to format the message text.
function replaceCommaBasedOnSentiment(text) {
    if (!text) {
        return text;
    }

    // Normalize quotes to straight quotes
    text = text.replace(/["“”]/g, '"');

    // Split the text into sections based on quotation marks.
    const parts = text.split('"');
    let formattedText = '';
    let narrationParts = []; // Array to hold consecutive narration parts

    // Process each section, alternating between narration and dialogue.
    parts.forEach((part, i) => {
        part = part.trim();
        if (!part) return;

        if (i % 2 === 0) {
            // Narration part (outside quotes)
            narrationParts.push(part); // Add to narration parts array
        } else {
            // Dialogue part (inside quotes)
            // Process and append any pending narration parts
            if (narrationParts.length > 0) {
                let narrationBlock = narrationParts.join(' '); // Combine consecutive narration parts
                if (!narrationBlock.startsWith('*')) {
                    narrationBlock = '*' + narrationBlock;
                }
                if (!narrationBlock.endsWith('*')) {
                    narrationBlock += '*';
                }
                formattedText += narrationBlock + ' '; // Add combined narration with space
                narrationParts = []; // Reset the narration parts array
            }
            if (part && part.endsWith(',')) {
                const sentiment = analyzeSentiment(part);
                if (sentiment.compound > 0.05) {
                    part = part.slice(0, -1) + '!';
                } else if (sentiment.compound < -0.05) {
                    part = part.slice(0, -1) + '...';
                } else {
                    part = part.slice(0, -1) + '.';
                }
            }
            formattedText += `"${part}" `; // Add dialogue with quotes and a space
        }
    });
    // Handle any remaining narration parts at the end
    if (narrationParts.length > 0) {
        let narrationBlock = narrationParts.join(' ');
        if (!narrationBlock.startsWith('*')) {
            narrationBlock = '*' + narrationBlock;
        }
        if (!narrationBlock.endsWith('*')) {
            narrationBlock += '*';
        }
        formattedText += narrationBlock + ' ';
    }

    // --- NEW: Collapse all whitespace (including newlines) into a single space ---
    formattedText = formattedText.replace(/\s+/g, ' ').trim();

    // Ensure dialogue is outside asterisks
    formattedText = formattedText.replace(/\*"([^"]+)"\*/g, '"$1"');
    formattedText = formattedText.replace(/\*"/g, '* "').replace(/"\*/g, '" *');

    // Remove any unintended "* *"
    formattedText = formattedText.replace(/\* \*/g, ' ');
    // Remove any '" "'
    formattedText = formattedText.replace(/" "/g, ' ');
    // Other cleanup (remove any double asterisks)
    formattedText = formattedText.replace(/\*\*/g, '*').trim();

    return formattedText;
}

// Formats a single message.
function formatMessage(message) {
    if (message.is_user || !message.mes) {
        return false;
    }
    // Store the original message before formatting
    if (!message.extra) {
        message.extra = {};
    }
    if (message.extra.original_mes === undefined) {
        message.extra.original_mes = message.mes;
    }

    const formattedText = replaceCommaBasedOnSentiment(message.mes);
    if (formattedText !== message.mes) {
        message.mes = formattedText;

        // Update the message in the UI by re-rendering only the content using messageFormatting
        const messageElement = document.querySelector(`.mes[mesid="${getContext().chat.indexOf(message)}"] .mes_text`);
        if (messageElement) {
            messageElement.innerHTML = coreMessageFormatting(formattedText, message.name, message.is_system, message.is_user, getContext().chat.indexOf(message));
        }
        // Update swipe messages array if it exists
        if (Array.isArray(message.swipes)) {
            for (let i = 0; i < message.swipes.length; i++) {
                // Store original swipe content before formatting
                if (message.extra.original_swipes === undefined) {
                    message.extra.original_swipes = [];
                }
                if (message.extra.original_swipes[i] === undefined) {
                    message.extra.original_swipes[i] = message.swipes[i];
                }
                message.swipes[i] = replaceCommaBasedOnSentiment(message.swipes[i]); // Re-format each swipe
            }
        }

        return true; // Return true if the message was modified
    }
    return false; // Indicate no modification
}

// Formats all AI messages in the current chat.
function formatAllAiMessages() {
    const context = getContext();
    if (!context.chat) {
        return false;
    }

    let modified = false;
    context.chat.forEach((message) => {
        if (message.is_user || !message.mes) return;
        // Store original message before formatting.
        if (!message.extra) {
             message.extra = {};
        }
        if (message.extra.original_mes === undefined) {
            message.extra.original_mes = message.mes;
        }

        const formattedText = replaceCommaBasedOnSentiment(message.mes);
        if (formattedText !== message.mes) {
            message.mes = formattedText;
            modified = true;

            // Update the message in the UI by re-rendering only the content using messageFormatting
            const messageElement = document.querySelector(`.mes[mesid="${context.chat.indexOf(message)}"] .mes_text`);
            if (messageElement) {
                messageElement.innerHTML = coreMessageFormatting(formattedText, message.name, message.is_system, message.is_user, getContext().chat.indexOf(message));
            }
            // Update swipe messages array if it exists
            if (Array.isArray(message.swipes)) {
                for (let i = 0; i < message.swipes.length; i++) {
                    // Store original swipe content before formatting
                    if (message.extra.original_swipes === undefined) {
                        message.extra.original_swipes = [];
                    }
                    if (message.extra.original_swipes[i] === undefined) {
                        message.extra.original_swipes[i] = message.swipes[i];
                    }
                    message.swipes[i] = replaceCommaBasedOnSentiment(message.swipes[i]); // Re-format each swipe
                }
            }
        }
    });

    if (modified) {
        coreSaveChatDebounced(); // Save the chat if modified
    }
    return modified;
}

function undoFormat() {
    const context = getContext();
    if (!context.chat) {
        return;
    }

    let modified = false;
    context.chat.forEach((message) => {
        if (message.is_user || !message.extra || !message.extra.original_mes) {
            return;
        }
        // Restore original message
        message.mes = message.extra.original_mes;

        // Restore original swipes
        if (Array.isArray(message.swipes) && Array.isArray(message.extra.original_swipes)) {
            for (let i = 0; i < message.swipes.length; i++) {
                if (message.extra.original_swipes[i] !== undefined) {
                    message.swipes[i] = message.extra.original_swipes[i];
                }
            }
        }

        delete message.extra.original_mes;  // Clean up the 'original_mes' property
        delete message.extra.original_swipes; // Clean up the 'original_swipes' property
        modified = true;

        // Update the message in the UI.
        const messageElement = document.querySelector(`.mes[mesid="${context.chat.indexOf(message)}"] .mes_text`);
        if (messageElement) {
            messageElement.innerHTML = coreMessageFormatting(message.mes, message.name, message.is_system, message.is_user, context.chat.indexOf(message));
        }
    });

    if (modified) {
        coreSaveChatDebounced(); // Save the chat after undoing formatting
    }
    return modified;
}

// Function to refresh the chat display (stub - no refresh for this attempt)
function refreshChat() {
    return; // Do nothing for this attempt - rely on targeted DOM manipulation
}

// Initialize extension
jQuery(async () => {
    // Load settings
    loadSettings();

    // Load settings HTML
    const settingsHtml = await $.get(`${extensionFolderPath}/settings.html`);
    $("#extensions_settings2").append(settingsHtml);

    // Set up event listeners for the settings
    $("#enable_formatter").on("input", onEnableFormatterChange);
    $("#auto_format").on("input", onAutoFormatChange);
    $("#positive_replacement").on("input", onPositiveChange);
    $("#negative_replacement").on("input", onNegativeChange);
    $("#neutral_replacement").on("input", onNeutralChange);
    $("#positive_threshold").on("input", onPositiveThresholdChange);
    $("#negative_threshold").on("input", onNegativeThresholdChange);

    // Load initial values (ensure settings exist)
    loadSettings();

    // Register the format command
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'format',
        helpString: 'Format all AI messages with sentiment-based punctuation',
        returns: 'string',
        callback: async () => {
            if (!extension_settings[extensionName].enabled) {
                return 'Extension is disabled in settings';
            }

            const modified = formatAllAiMessages();
            refreshChat(); // Call refreshChat (stub) – for potential future use
            toastr.info(modified ? 'Messages formatted successfully!' : 'No messages needed formatting.');
            return modified ? 'Messages formatted successfully!' : 'No messages needed formatting.';
        },
        unnamedArgumentList: [],
    }));

    // Register the undoformat command
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'undoformat',
        aliases: ['unformat'],
        helpString: 'Undo the formatting applied by the /format command.',
        returns: 'string',
        callback: async () => {
            const modified = undoFormat();
            refreshChat();
            toastr.info(modified ? 'Messages unformatted successfully!' : 'No messages needed unformatting.');
            return modified ? 'Messages unformatted successfully!' : 'No messages needed unformatting.';
        },
        unnamedArgumentList: [],
    }));

    // Listen for new messages and auto-format if enabled
    eventSource.on(event_types.MESSAGE_RECEIVED, async (data) => {
        if (extension_settings[extensionName].enabled && extension_settings[extensionName].autoFormat) {
            // Ensure data and data.message exist before processing
            if (data && data.message) {
                if (formatMessage(data.message)) {
                    refreshChat(); // Call refreshChat (stub) – for potential future use
                    coreSaveChatDebounced(); // Also save chat on auto-format
                }
            }
        }
    });
});
