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
    negativeThreshold: -0.05,   // Default neutral threshold
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
            score += matches.length * 0.1;
        }
    });

    // Count occurrences of negative words.
    negativeWords.forEach(word => {
        const regex = new RegExp(`\\b${word}\\b`, 'g');
        const matches = text.match(regex);
        if (matches) {
            score -= matches.length * 0.1;
        }
    });

    return {
        compound: score
    };
}

function formatDialogue(dialogueText) {
    if (!dialogueText.endsWith(',')) {
        return dialogueText;
    }

    const sentiment = analyzeSentiment(dialogueText);
    const settings = extension_settings[extensionName];
    let replacement = settings.neutralReplacement;

    if (sentiment.compound > settings.positiveThreshold) {
        replacement = settings.positiveReplacement;
    } else if (sentiment.compound < settings.negativeThreshold) {
        replacement = settings.negativeReplacement;
    } else {
        replacement = settings.neutralReplacement;
    }

    return dialogueText.slice(0, -1) + replacement;
}

function replaceCommaBasedOnSentiment(text) {
    if (!text) {
        return text;
    }

    text = text.replace(/["“”]/g, '"');

    const parts = text.split('"');
    let formattedText = '';
    let narrationParts = [];

    parts.forEach((part, i) => {
        part = part.trim();
        if (!part) return;

        if (i % 2 === 0) {
            narrationParts.push(part);
        } else {
            if (narrationParts.length > 0) {
                let narrationBlock = narrationParts.join(' ');
                if (!narrationBlock.startsWith('*')) {
                    narrationBlock = '*' + narrationBlock;
                }
                if (!narrationBlock.endsWith('*')) {
                    narrationBlock += '*';
                }
                formattedText += narrationBlock + ' ';
                narrationParts = [];
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
            formattedText += `"${part}" `;
        }
    });
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

    formattedText = formattedText.replace(/\s+/g, ' ').trim();
    formattedText = formattedText.replace(/(?<="[^"]*)\*(?=[^"]*")/g, ' ');
    formattedText = formattedText.replace(/\*"([^"]+)"\*/g, '"$1"');
    formattedText = formattedText.replace(/\*"/g, '* "').replace(/"\*/g, '" *');
    formattedText = formattedText.replace(/\* \*/g, ' ');
    formattedText = formattedText.replace(/\*\*/g, '*').trim();

    return formattedText;
}

// ------------------------
// Apply format to a single message (including all its swipes)
function formatMessage(message, formatAllSwipes = false) {
    if (message.is_user || !message.mes) {
        return false;
    }

    if (!message.extra) {
        message.extra = {};
    }

    // Store original message if not already done
    if (message.extra.original_mes === undefined) {
        message.extra.original_mes = message.mes;
    }

    // Always store pre-format message
    message.extra.pre_format_mes = message.mes;

    // Initialize swipes if they don't exist
    if (!Array.isArray(message.swipes)) {
        message.swipes = [message.mes];
        message.swipe_id = 0;
    }

    if (message.extra.original_swipes === undefined) {
        message.extra.original_swipes = [...message.swipes]; // Store original swipes
    }

    // Always store pre-format swipes.
    message.extra.pre_format_swipes = [...message.swipes];

    let modified = false;
    const formattedText = replaceCommaBasedOnSentiment(message.mes);
    if (formattedText !== message.mes) {
        message.mes = formattedText;
        modified = true;
    }

    // Format all swipes
    if (Array.isArray(message.swipes)) {
        let swipeIndex = message.swipe_id;
        let formattedSwipes;
        if(formatAllSwipes){
            formattedSwipes = message.swipes.map(swipe => replaceCommaBasedOnSentiment(swipe));
        } else {
            formattedSwipes = [...message.swipes];
            formattedSwipes[swipeIndex] = replaceCommaBasedOnSentiment(formattedSwipes[swipeIndex]);
        }
        if (JSON.stringify(formattedSwipes) !== JSON.stringify(message.swipes)) { // Quick compare arrays
            message.swipes = formattedSwipes;
            modified = true;
        }
    }
    return modified;
}

// ------------------------
// Global formatting: Format all messages
function formatAllAiMessages(formatAllSwipes = false) {
    const context = getContext();
    if (!context.chat) {
        return false;
    }

    let modified = false;
    context.chat.forEach((message) => {
        // Only format AI messages.
        if (!message.is_user) {
            if (formatMessage(message, formatAllSwipes)) {
                modified = true;

                const mesIndex = context.chat.indexOf(message);
                const messageElement = document.querySelector(`.mes[mesid="${mesIndex}"] .mes_text`);
                if (messageElement) { //Update ALL
                    messageElement.innerHTML = coreMessageFormatting(message.mes, message.name, message.is_system, message.is_user, mesIndex);
                }
            }
        }
    });

    if (modified) {
        coreSaveChatDebounced();
    }
    return modified;
}

// ------------------------
// Undo format for a single message (including all its swipes)
function undoFormatMessage(message) {
    if (message.is_user || !message.extra || message.extra.pre_format_mes === undefined) {
        return false;
    }

    let modified = false;

    // Restore main message text from pre_format_mes
    if (message.mes !== message.extra.pre_format_mes) {
        message.mes = message.extra.pre_format_mes;
        modified = true;
    }

    // Restore all swipes if pre-format swipes are available
    if (Array.isArray(message.swipes) && Array.isArray(message.extra.pre_format_swipes)) {
        // Compare each swipe to its pre-format version, restoring only if different
        for (let i = 0; i < message.swipes.length; i++) {
            if (message.extra.pre_format_swipes[i] !== undefined && message.swipes[i] !== message.extra.pre_format_swipes[i]) {
                message.swipes[i] = message.extra.pre_format_swipes[i];
                modified = true;
            }
        }
    }

    // Clean up pre_format data (only if modified), keep original
    if (modified) {
        delete message.extra.pre_format_mes;
        delete message.extra.pre_format_swipes;
    }

    return modified;
}


// ------------------------
// Global undo: Restore all messages
function undoFormatAll() {
    const context = getContext();
    if (!context.chat) {
        return false;
    }

    let modified = false;
    context.chat.forEach((message) => {
        if (undoFormatMessage(message)) { // Apply undoFormatMessage to each message
            modified = true;
             // Update message in UI (only last message needs full UI update on MESSAGE_RECEIVED)
            const mesIndex = context.chat.indexOf(message);
            const messageElement = document.querySelector(`.mes[mesid="${mesIndex}"] .mes_text`);
             if (messageElement) {
                messageElement.innerHTML = coreMessageFormatting(message.mes, message.name, message.is_system, message.is_user, mesIndex);
            }
        }
    });

    if (modified) {
        coreSaveChatDebounced();
    }
    return modified;
}


// ------------------------
//  Format Last AI Message Only (affects only the last message and its active swipe) - now using formatMessage
// ------------------------
function formatLastAiMessage() {
    const context = getContext();
    if (!context.chat || context.chat.length === 0) return false;
    const msgIndex = context.chat.length - 1;
    const message = context.chat[msgIndex];

    if (!message || message.is_user || !message.mes) return false;

    if (formatMessage(message)) {
         // Update message in UI (only last message)
        const messageElement = document.querySelector(`.mes[mesid="${msgIndex}"] .mes_text`);
        if (messageElement) {
            messageElement.innerHTML = coreMessageFormatting(message.mes, message.name, message.is_system, message.is_user, msgIndex);
        }
        coreSaveChatDebounced();
        return true;
    }
    return false;
}

// ------------------------
//  Undo formatting for Last AI Message Only (restore only the last message and its active swipe) - now using undoFormatMessage
// ------------------------
function undoFormatLastAiMessage() {
    const context = getContext();
    if (!context.chat || context.chat.length === 0) return false;
    const msgIndex = context.chat.length - 1;
    const message = context.chat[msgIndex];

    if (!message || message.is_user || !message.extra || message.extra.original_mes === undefined) return false;


    if (undoFormatMessage(message)) {
         // Update message in UI (only last message)
        const messageElement = document.querySelector(`.mes[mesid="${msgIndex}"] .mes_text`);
        if (messageElement) {
            messageElement.innerHTML = coreMessageFormatting(message.mes, message.name, message.is_system, message.is_user, msgIndex);
        }
        coreSaveChatDebounced();
        return true;
    }
    return false;
}

//MODIFIED onMessageUpdate
function onMessageUpdate(msgIndex) {
    const context = getContext();
    if (msgIndex >= context.chat.length || msgIndex < 0) return;

    const message = context.chat[msgIndex];

    // Only handle this hook if auto formatting is disabled and extension is enabled
    if (!extension_settings[extensionName].enabled || !message || message.is_user) {
        return;
    }
    // If message has been formatted before, save it.
    if(message.extra && message.extra.pre_format_mes !== undefined){
        message.extra.pre_format_mes = message.mes;
        message.extra.pre_format_swipes = message.swipes ? [...message.swipes] : undefined; // Use spread operator or slice()
        coreSaveChatDebounced();
    }

    if (!extension_settings[extensionName].autoFormat) {
        if (formatMessage(message, false)) {
            // Refresh this single message
            const messageElement = document.querySelector(`.mes[mesid="${msgIndex}"] .mes_text`);
            if (messageElement) {
                messageElement.innerHTML = coreMessageFormatting(message.mes, message.name, message.is_system, message.is_user, msgIndex);
            }
            coreSaveChatDebounced();
        }
    }
}

// ------------------------
// Fallback: Stub for chat refresh.
function refreshChat() {
     eventSource.emit(event_types.CHAT_CHANGED, getContext().chatId); // force chat to rerender
}

// ------------------------
// Initialize extension
// ------------------------
jQuery(async () => {
    loadSettings();

    // Load settings HTML
    const settingsHtml = await $.get(`${extensionFolderPath}/settings.html`);
    $("#extensions_settings2").append(settingsHtml);

    $("#enable_formatter").on("input", onEnableFormatterChange);
    $("#auto_format").on("input", onAutoFormatChange);
    $("#positive_replacement").on("input", onPositiveChange);
    $("#negative_replacement").on("input", onNegativeChange);
    $("#neutral_replacement").on("input", onNeutralChange);
    $("#positive_threshold").on("input", onPositiveThresholdChange);
    $("#negative_threshold").on("input", onNegativeThresholdChange);

    loadSettings();

    // Register the format command to process only visible messages and visible swipes.
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'format',
        helpString: 'Format all AI messages with sentiment-based punctuation',
        returns: 'string',
        callback: async () => {
            if (!extension_settings[extensionName].enabled) {
                return 'Extension is disabled in settings';
            }
            const modified = formatAllAiMessages(false); // Only format visible swipes
            refreshChat();
            toastr.info(modified ? 'Messages formatted successfully!' : 'No messages needed formatting.');
            return modified ? 'Messages formatted successfully!' : 'No messages needed formatting.';
        },
        unnamedArgumentList: [],
    }));

    // Register the undoformat command to process only visible messages and swipes.
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'undoformat',
        aliases: ['unformat'],
        helpString: 'Undo the formatting applied by the /format command.',
        returns: 'string',
        callback: async () => {
            const modified = undoFormatAll();
            refreshChat();
            toastr.info(modified ? 'Messages unformatted successfully!' : 'No messages needed unformatting.');
            return modified ? 'Messages unformatted successfully!' : 'No messages needed unformatting.';
        },
        unnamedArgumentList: [],
    }));

    // Register the new /formatlast command.
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'formatlast',
        helpString: 'Format only the last AI message and its active swipe with sentiment-based punctuation',
        returns: 'string',
        callback: async () => {
            if (!extension_settings[extensionName].enabled) {
                return 'Extension is disabled in settings';
            }
            const modified = formatLastAiMessage();
            refreshChat();
            toastr.info(modified ? 'Last message formatted successfully!' : 'Last message did not need formatting.');
            return modified ? 'Last message formatted successfully!' : 'Last message did not need formatting.';
        },
        unnamedArgumentList: [],
    }));

    // Register the new /undoformatlast command.
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'undoformatlast',
        aliases: ['unformatlast'],
        helpString: 'Undo formatting on only the last AI message and its active swipe',
        returns: 'string',
        callback: async () => {
            const modified = undoFormatLastAiMessage();
            refreshChat();
            toastr.info(modified ? 'Last message restored successfully!' : 'No changes to undo on last message.');
            return modified ? 'Last message restored successfully!' : 'No changes to undo on last message.';
        },
        unnamedArgumentList: [],
    }));

    // Fallback: Register global commands if needed.
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'formatall',
        helpString: 'Format all AI messages (global formatting)',
        returns: 'string',
        callback: async () => {
            if (!extension_settings[extensionName].enabled) {
                return 'Extension is disabled in settings';
            }
            const modified = formatAllAiMessages(true);  // Format all swipes
            refreshChat();
            toastr.info(modified ? 'All messages formatted successfully!' : 'No messages needed formatting.');
            return modified ? 'All messages formatted successfully!' : 'No messages needed formatting.';
        },
        unnamedArgumentList: [],
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'undoformatall',
        aliases: ['unformatall'],
        helpString: 'Undo global formatting',
        returns: 'string',
        callback: async () => {
            const modified = undoFormatAll();
            refreshChat();
            toastr.info(modified ? 'All messages unformatted successfully!' : 'No messages needed unformatting.');
            return modified ? 'All messages unformatted successfully!' : 'No messages needed unformatting.';
        },
        unnamedArgumentList: [],
    }));

    // Listen for new messages and auto-format if enabled.
    eventSource.on(event_types.MESSAGE_RECEIVED, async (data) => {
        // Fixed the auto-format logic here
        if (extension_settings[extensionName].enabled && extension_settings[extensionName].autoFormat) {
            if (data && data.message) {
                if (formatMessage(data.message, true)) {
                    refreshChat(); // Use refreshChat for consistency
                    coreSaveChatDebounced();
                }
            }
        }
    });

    // Hook into message updates
    eventSource.on(event_types.MESSAGE_UPDATED, onMessageUpdate);
    eventSource.on(event_types.MESSAGE_EDITED, onMessageUpdate); // also use MESSAGE_EDITED
});
