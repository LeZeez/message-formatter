import { extension_settings, getContext, loadExtensionSettings } from "../../../extensions.js";
import { saveSettingsDebounced, eventSource, event_types, saveChatDebounced as coreSaveChatDebounced, messageFormatting as coreMessageFormatting } from "../../../../script.js"; // Import saveChatDebounced and messageFormatting
import { SlashCommand } from '../../../slash-commands/SlashCommand.js';
import { ARGUMENT_TYPE, SlashCommandArgument } from '../../../slash-commands/SlashCommandArgument.js';
import { SlashCommandParser } from '../../../slash-commands/SlashCommandParser.js';

// Extension configuration
const extensionName = "message-formatter";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

class FormatterToolbox {
    constructor() {
        this.settings = {};
        this.tools = [];
        this.defaultSettings = {
            enabled: true,
            autoFormat: true,
            positiveReplacement: "!",
            negativeReplacement: "...",
            neutralReplacement: ".",
            positiveThreshold: 0.05,
            negativeThreshold: -0.05,
            findAndReplaceRules: [
                { find: "i'm", replaceWith: "I'm", isRegex: false, caseSensitive: false, enabled: true },
                { find: "i ", replaceWith: "I ", isRegex: false, caseSensitive: false, enabled: true },
                { find: "(\\s+)([.,?!])", replaceWith: "$2", isRegex: true, caseSensitive: false, enabled: true }, // Removes space before punctuation
                { find: "gonna", replaceWith: "going to", isRegex: false, caseSensitive: false, enabled: true },
                { find: "\\s\\s+", replaceWith: " ", isRegex: true, caseSensitive: false, enabled: true } // Double space to single
            ],
            paragraphControlMode: 'none',
            paragraphControlMax: 3,
            paragraphControlMin: 1,
            styleMapperRules: [
                { name: "Asterisk Emphasis (Thought/Italic)", findRegex: "\\*([^\\*]+?)\\*", tagName: "thought", replacePattern: "$TAG_START$1$TAG_END", enabled: true },
                { name: "Double Asterisk (Bold)", findRegex: "\\*\\*([^\\*]+?)\\*\\*", tagName: "bold", replacePattern: "$TAG_START$1$TAG_END", enabled: true },
                { name: "Quotes (Dialogue)", findRegex: "\"([^\"\\n]+?)\"", tagName: "dialogue", replacePattern: "$TAG_START$1$TAG_END", enabled: true }
            ],
            smartPunctuationTargetTag: 'dialogue',
            smartPunctuationEnabled: true,
            caseFormatterSentenceCase: true,
            toolOrder: [],
            quickActionToolbarEnabled: false,
            quickActionWrapperPresets: [
                { name: "Parentheses", start: "(", end: ")" },
                { name: "Brackets", start: "[", end: "]" },
                { name: "Braces", start: "{", end: "}" }
            ],
            tagAutoCloseEnabled: false // Added this default
        };
        this.tools.push(new FindAndReplaceTool());
        this.tools.push(new ParagraphControlTool());
        this.tools.push(new StyleMapperTool());
        this.tools.push(new SmartPunctuationTool());
        this.tools.push(new CaseFormatterTool());
    }

    loadSettings() {
        let savedSettings = extension_settings[extensionName];

        if (!savedSettings || Object.keys(savedSettings).length === 0) {
            // No settings saved or empty object, so deep clone defaultSettings
            this.settings = JSON.parse(JSON.stringify(this.defaultSettings));
            extension_settings[extensionName] = this.settings;
        } else {
            // Start with a full copy of defaultSettings to ensure all keys are present
            this.settings = JSON.parse(JSON.stringify(this.defaultSettings));

            // Overwrite defaults with saved settings for known keys
            for (const key in this.settings) { // Iterate over keys from defaultSettings
                if (savedSettings.hasOwnProperty(key)) {
                    // For arrays, if saved value is an array, use it. Otherwise, default is already set.
                    // This means user's saved arrays (rules, presets) replace default arrays.
                    if (Array.isArray(this.settings[key])) {
                        if (Array.isArray(savedSettings[key])) {
                            this.settings[key] = savedSettings[key];
                        }
                        // If saved key is not an array but default is, default is kept (from initial clone).
                    }
                    // For non-array types, directly assign the saved value.
                    else {
                        this.settings[key] = savedSettings[key];
                    }
                }
            }

            // Ensure specific array typed settings are valid arrays, re-defaulting if corrupted.
            ['findAndReplaceRules', 'styleMapperRules', 'quickActionWrapperPresets', 'toolOrder'].forEach(key => {
                if (!Array.isArray(this.settings[key])) {
                    // If corrupted (not an array), reset to the default for that specific key
                    this.settings[key] = JSON.parse(JSON.stringify(this.defaultSettings[key]));
                }
            });

            // Special handling for toolOrder integrity
            const currentToolNames = this.tools.map(tool => tool.constructor.name);
            if (currentToolNames.length > 0) { // Only process toolOrder if tools are defined
                let validOrder = Array.isArray(this.settings.toolOrder) ? this.settings.toolOrder : [];

                // Filter out tools from saved order that no longer exist
                validOrder = validOrder.filter(toolName => currentToolNames.includes(toolName));

                const existingInOrder = new Set(validOrder);
                // Add any new tools (present in currentToolNames but not in validOrder) to the end
                currentToolNames.forEach(toolName => {
                    if (!existingInOrder.has(toolName)) {
                        validOrder.push(toolName);
                    }
                });
                this.settings.toolOrder = validOrder;

                // If, after all this, toolOrder is empty (e.g., first load after tools are defined, or all saved tools were invalid)
                // or if its length doesn't match the current tools (meaning some were only filtered out, not added)
                // then reset to the default order based on current tools.
                if (this.settings.toolOrder.length === 0 || this.settings.toolOrder.length !== currentToolNames.length) {
                     this.settings.toolOrder = [...currentToolNames];
                }
            } else {
                 this.settings.toolOrder = []; // No tools, empty order
            }

            // Update the global extension_settings object with the merged and validated settings
            Object.assign(extension_settings[extensionName], this.settings);
        }
    }

    saveSettings() {
        extension_settings[extensionName] = this.settings;
        saveSettingsDebounced();
    }

    initializeDynamicContentTypes() {
        if (typeof this.renderGeneralSettings === 'function') {
            this.renderGeneralSettings();
            $('#general-enable-formatter, #general-auto-format').off('change').on('change', () => this.updateGeneralSettings());
        }
        if (typeof this.renderFindAndReplaceRules === 'function') {
            this.renderFindAndReplaceRules();
            $('#fnr-add-rule').off('click').on('click', () => this.addFindAndReplaceRule());
        }
        if (typeof this.renderParagraphControlSettings === 'function') {
            this.renderParagraphControlSettings();
            $('#pc-mode').off('change').on('change', () => this.updateParagraphControlSettings());
            $('#pc-max-paras').off('input').on('input', () => this.updateParagraphControlSettings());
            $('#pc-min-paras').off('input').on('input', () => this.updateParagraphControlSettings());
        }
        if (typeof this.renderStyleMapperRules === 'function') {
            this.renderStyleMapperRules();
            $('#sm-add-rule').off('click').on('click', () => this.addStyleMapperRule());
        }
        if (typeof this.renderSmartPunctuationSettings === 'function') {
            this.renderSmartPunctuationSettings();
            $('#tab-smart-punctuation input, #tab-smart-punctuation select').off('input change').on('input change', () => this.updateSmartPunctuationSettings());
        }
        if (typeof this.renderCaseFormatterSettings === 'function') {
            this.renderCaseFormatterSettings();
            $('#cf-sentence-case').off('change').on('change', () => this.updateCaseFormatterSettings());
        }
        if (typeof this.renderQuickActionSettings === 'function') {
            this.renderQuickActionSettings(); // This will now also render presets
            $('#qa-toolbar-enabled').off('change').on('change', () => this.updateQuickActionSettings());
            // Event listeners for new preset UI will be in renderQuickActionSettings
        }
        if (typeof this.renderTagAutoCloseSettings === 'function') {
            this.renderTagAutoCloseSettings();
            $('#tac-enabled').off('change').on('change', () => this.updateTagAutoCloseSettings());
        }

        if (this.settings.quickActionToolbarEnabled) {
            this.injectToolbarHTML();
            this.initializeTextSelectionListener();
        }
        if (this.settings.tagAutoCloseEnabled) {
            this.initializeTagAutoCloseListener();
        }
    }

    renderGeneralSettings() { /* ... (already implemented) ... */
        if (!$('#general-enable-formatter').length) return;
        const settings = this.settings;
        if (settings.enabled === undefined) settings.enabled = true;
        if (settings.autoFormat === undefined) settings.autoFormat = true;
        $('#general-enable-formatter').prop('checked', settings.enabled);
        $('#general-auto-format').prop('checked', settings.autoFormat);
        this.renderToolOrderList();
    }
    updateGeneralSettings() { /* ... (already implemented) ... */
        if (!$('#general-enable-formatter').length) return;
        this.settings.enabled = $('#general-enable-formatter').is(':checked');
        this.settings.autoFormat = $('#general-auto-format').is(':checked');
        this.saveSettings();
    }
    renderToolOrderList() { /* ... (already implemented, ensure sync logic is robust) ... */
        const container = $('#tool-order-list');
        if (!container.length) return;
        container.empty();
        const currentToolNames = this.tools.map(tool => tool.constructor.name);
        if (!this.settings.toolOrder || this.settings.toolOrder.length === 0 ||
            !this.settings.toolOrder.every(toolName => currentToolNames.includes(toolName)) ||
            this.settings.toolOrder.length !== currentToolNames.length ) {
            this.settings.toolOrder = [...currentToolNames];
        }
        this.settings.toolOrder.forEach((toolName, index) => {
            const toolInstance = this.tools.find(t => t.constructor.name === toolName);
            let displayName = toolName.replace('Tool', '');
            if (toolInstance && typeof toolInstance.getDisplayName === 'function') {
                displayName = toolInstance.getDisplayName();
            } else {
                displayName = displayName.replace(/([A-Z])/g, ' $1').trim();
            }
            const listItem = $('<li></li>').addClass('tool-order-item').attr('data-tool-id', toolName).text(`${index + 1}. ${displayName}`);
            container.append(listItem);
        });
        this.initializeToolOrderDragAndDrop();
    }
    initializeToolOrderDragAndDrop() { /* ... (already implemented) ... */
        const listElement = document.getElementById('tool-order-list');
        if (!listElement) return;
        if (listElement.sortableInstance) { listElement.sortableInstance.destroy(); }
        if (typeof Sortable !== 'undefined') {
            listElement.sortableInstance = new Sortable(listElement, {
                animation: 150, ghostClass: 'dragging',
                onEnd: (evt) => {
                    const newOrder = Array.from(evt.target.children).map(item => $(item).data('tool-id'));
                    this.settings.toolOrder = newOrder;
                    this.saveSettings();
                    this.renderToolOrderList();
                }
            });
        } else { if (!this.sortableWarningShown) { console.log("FormatterToolbox: SortableJS not available."); this.sortableWarningShown = true;}}
    }
    renderFindAndReplaceRules() {
        const description = "Purpose: To perform initial, raw text cleanup. It's perfect for fixing common AI typos (e.g., `i` -> `I`), removing unwanted artifacts (e.g., extra spaces before punctuation), or making consistent word choice substitutions (`gonna` -> `going to`). Features: A user-managed list of replacement rules. Each rule can be a simple text-to-text replacement or a powerful Regular Expression (Regex) replacement. Rules can be individually enabled, disabled, edited, and deleted.";
        $('#tab-find-replace .tool-description').html(description);

        const container = $('#fnr-rules-container');
        if (!container.length) return;
        container.empty();
        const rules = this.settings.findAndReplaceRules || [];
        rules.forEach((rule, index) => {
            const item = $('#fnr-rule-template .fnr-rule-item').clone();
            item.find('.fnr-find').val(rule.find);
            item.find('.fnr-replace').val(rule.replaceWith);
            item.find('.fnr-is-regex').prop('checked', rule.isRegex);
            item.find('.fnr-case-sensitive').prop('checked', rule.caseSensitive);
            item.find('.fnr-enabled').prop('checked', rule.enabled);
            item.find('.fnr-delete-rule').on('click', () => this.deleteFindAndReplaceRule(index));
            item.find('input').on('change input', () => this.updateFindAndReplaceRule(index, item));
            container.append(item);
        });
    }
    updateFindAndReplaceRule(index, el) { /* ... (already implemented) ... */
        const rules = this.settings.findAndReplaceRules || [];
        if (!rules[index]) return;
        rules[index].find = el.find('.fnr-find').val();
        rules[index].replaceWith = el.find('.fnr-replace').val();
        rules[index].isRegex = el.find('.fnr-is-regex').is(':checked');
        rules[index].caseSensitive = el.find('.fnr-case-sensitive').is(':checked');
        rules[index].enabled = el.find('.fnr-enabled').is(':checked');
        this.saveSettings();
    }
    addFindAndReplaceRule() { /* ... (already implemented) ... */
        const newRule = { find: "", replaceWith: "", isRegex: false, caseSensitive: false, enabled: true };
        this.settings.findAndReplaceRules = this.settings.findAndReplaceRules || [];
        this.settings.findAndReplaceRules.push(newRule);
        this.saveSettings(); this.renderFindAndReplaceRules();
    }
    deleteFindAndReplaceRule(index) { /* ... (already implemented) ... */
        this.settings.findAndReplaceRules = this.settings.findAndReplaceRules || [];
        if (this.settings.findAndReplaceRules[index]) {
            this.settings.findAndReplaceRules.splice(index, 1);
            this.saveSettings(); this.renderFindAndReplaceRules();
        }
    }
    renderParagraphControlSettings() {
        const description = "Purpose: To enforce a consistent paragraph structure in the AI's response. Features: Force Single Paragraph: Collapses the entire response into one paragraph. Allow Maximum: Ensures the response does not exceed a user-defined number of paragraphs. Ensure Minimum: Ensures the response has at least a user-defined number of paragraphs (does nothing if it already meets the minimum).";
        $('#tab-paragraph-control .tool-description').html(description);

        if (!$('#pc-mode').length) return;
        const s = this.settings;
        $('#pc-mode').val(s.paragraphControlMode || 'none');
        $('#pc-max-paras').val(s.paragraphControlMax || 3);
        $('#pc-min-paras').val(s.paragraphControlMin || 1);
        this.toggleParagraphControlInputs();
    }
    toggleParagraphControlInputs() { /* ... (already implemented) ... */
        if (!$('#pc-mode').length) return;
        const mode = $('#pc-mode').val();
        $('.pc-max-container').toggle(mode === 'max');
        $('.pc-min-container').toggle(mode === 'min');
    }
    updateParagraphControlSettings() { /* ... (already implemented) ... */
        if (!$('#pc-mode').length) return;
        this.settings.paragraphControlMode = $('#pc-mode').val();
        this.settings.paragraphControlMax = parseInt($('#pc-max-paras').val(),10) || 1;
        this.settings.paragraphControlMin = parseInt($('#pc-min-paras').val(),10) || 1;
        this.saveSettings(); this.toggleParagraphControlInputs();
    }
    renderStyleMapperRules() {
        const description = "Purpose: The core of semantic detection. This tool finds text patterns and wraps them in invisible tags, telling other tools 'this part is dialogue' or 'this part is a thought.' It doesn't change the visual style itself, but prepares the text for other tools. Features: A user-managed list of style rules based on Regex. Allows the user to define what patterns constitute different elements. For example: A rule to find text in asterisks (`*...*`) and tag it as a 'thought'. A rule to find text in quotes (`\"...\"`) and tag it as 'dialogue'.";
        $('#tab-style-mapper .tool-description').html(description);

        const container = $('#sm-rules-container');
        if (!container.length) return; container.empty();
        const rules = this.settings.styleMapperRules || [];
        rules.forEach((rule, index) => {
            const item = $('#sm-rule-template .sm-rule-item').clone();
            item.find('.sm-name').val(rule.name);
            item.find('.sm-find-regex').val(rule.findRegex);
            item.find('.sm-tag-name').val(rule.tagName);
            item.find('.sm-replace-pattern').val(rule.replacePattern);
            item.find('.sm-enabled').prop('checked', rule.enabled);
            item.find('.sm-delete-rule').on('click', () => this.deleteStyleMapperRule(index));
            item.find('input').on('change input', () => this.updateStyleMapperRule(index, item));
            container.append(item);
        });
    }
    updateStyleMapperRule(index, el) { /* ... (already implemented) ... */
        const rules = this.settings.styleMapperRules || [];
        if (!rules[index]) return;
        rules[index].name = el.find('.sm-name').val();
        rules[index].findRegex = el.find('.sm-find-regex').val();
        rules[index].tagName = el.find('.sm-tag-name').val();
        rules[index].replacePattern = el.find('.sm-replace-pattern').val();
        rules[index].enabled = el.find('.sm-enabled').is(':checked');
        this.saveSettings();
    }
    addStyleMapperRule() { /* ... (already implemented) ... */
        const newRule = { name: "New Rule", findRegex: "", tagName: "", replacePattern: "$TAG_START$1$TAG_END", enabled: true };
        this.settings.styleMapperRules = this.settings.styleMapperRules || [];
        this.settings.styleMapperRules.push(newRule);
        this.saveSettings(); this.renderStyleMapperRules();
    }
    deleteStyleMapperRule(index) { /* ... (already implemented) ... */
        this.settings.styleMapperRules = this.settings.styleMapperRules || [];
        if (this.settings.styleMapperRules[index]) {
            this.settings.styleMapperRules.splice(index, 1);
            this.saveSettings(); this.renderStyleMapperRules();
        }
    }
    renderSmartPunctuationSettings() {
        const description = "Purpose: The evolution of the original extension idea. It intelligently formats punctuation but is now much smarter because it acts upon the tags created by the Style Mapper. Features: Targets a specific element (e.g., only text tagged as 'dialogue'). Finds a target punctuation mark (e.g., a comma `,`) at the end of a line. Replaces it with different punctuation based on a sentiment analysis of the text (`!`, `...`, `.`, etc.). All replacement characters and sentiment thresholds are user-configurable.";
        $('#tab-smart-punctuation .tool-description').html(description);

        if (!$('#sp-enabled').length) return;
        const s = this.settings;
        if (s.smartPunctuationEnabled === undefined) s.smartPunctuationEnabled = true;
        $('#sp-enabled').prop('checked', s.smartPunctuationEnabled);
        $('#sp-target-tag').val(s.smartPunctuationTargetTag || 'dialogue');
        $('#sp-positive-replacement').val(s.positiveReplacement || '!');
        $('#sp-negative-replacement').val(s.negativeReplacement || '...');
        $('#sp-neutral-replacement').val(s.neutralReplacement || '.');
        $('#sp-positive-threshold').val(s.positiveThreshold || 0.05);
        $('#sp-negative-threshold').val(s.negativeThreshold || -0.05);
    }
    updateSmartPunctuationSettings() { /* ... (already implemented) ... */
        if (!$('#sp-enabled').length) return;
        this.settings.smartPunctuationEnabled = $('#sp-enabled').is(':checked');
        this.settings.smartPunctuationTargetTag = $('#sp-target-tag').val();
        this.settings.positiveReplacement = $('#sp-positive-replacement').val();
        this.settings.negativeReplacement = $('#sp-negative-replacement').val();
        this.settings.neutralReplacement = $('#sp-neutral-replacement').val();
        this.settings.positiveThreshold = parseFloat($('#sp-positive-threshold').val()) || 0.05;
        this.settings.negativeThreshold = parseFloat($('#sp-negative-threshold').val()) || -0.05;
        this.saveSettings();
    }
    renderCaseFormatterSettings() {
        const description = "Purpose: A final polishing tool to ensure consistent capitalization after all other text manipulations have occurred. Features: Sentence case: Automatically capitalizes the first letter of every sentence, fixing common AI errors where a new sentence starts with a lowercase letter.";
        $('#tab-case-formatter .tool-description').html(description);

        if (!$('#cf-sentence-case').length) return;
        const s = this.settings;
        if (s.caseFormatterSentenceCase === undefined) s.caseFormatterSentenceCase = true;
        $('#cf-sentence-case').prop('checked', s.caseFormatterSentenceCase);
    }
    updateCaseFormatterSettings() { /* ... (already implemented) ... */
        if (!$('#cf-sentence-case').length) return;
        this.settings.caseFormatterSentenceCase = $('#cf-sentence-case').is(':checked');
        this.saveSettings();
    }
    renderQuickActionSettings() {
        if (!$('#qa-toolbar-enabled').length) return;
        const s = this.settings;
        if (s.quickActionToolbarEnabled === undefined) s.quickActionToolbarEnabled = false;
        $('#qa-toolbar-enabled').prop('checked', s.quickActionToolbarEnabled);

        // Render presets
        const presetsContainer = $('#qa-presets-list-container');
        presetsContainer.empty();
        this.settings.quickActionWrapperPresets = this.settings.quickActionWrapperPresets || [];
        this.settings.quickActionWrapperPresets.forEach((preset, index) => {
            const itemHtml = `
                <div class="formatter-rule-item qa-preset-item" data-preset-index="${index}">
                    <div><label>Name:</label><span>${$('<div>').text(preset.name).html()}</span></div>
                    <div><label>Start:</label><code>${$('<div>').text(preset.start).html()}</code></div>
                    <div><label>End:</label><code>${$('<div>').text(preset.end).html()}</code></div>
                    <button class="formatter-button delete qa-delete-preset" style="margin-left:auto;">Delete</button>
                </div>`;
            presetsContainer.append(itemHtml);
        });

        // Add event listener for adding a new preset
        $('#qa-add-preset').off('click').on('click', () => {
            const name = $('#qa-preset-name').val().trim();
            const start = $('#qa-preset-start').val().trim();
            const end = $('#qa-preset-end').val().trim();
            if (name && start) { // End can be empty for self-closing style tags, though less common for wrappers
                this.settings.quickActionWrapperPresets.push({ name, start, end });
                this.saveSettings();
                this.renderQuickActionSettings(); // Re-render to show the new preset
                this.injectToolbarHTML(true); // Force toolbar refresh
                $('#qa-preset-name, #qa-preset-start, #qa-preset-end').val(''); // Clear inputs
            } else {
                toastr.warning("Preset Name and Start Wrapper are required.");
            }
        });

        // Add event listener for deleting presets (event delegation)
        presetsContainer.off('click', '.qa-delete-preset').on('click', '.qa-delete-preset', (e) => {
            const indexToDelete = $(e.currentTarget).closest('.qa-preset-item').data('preset-index');
            if (this.settings.quickActionWrapperPresets[indexToDelete]) {
                this.settings.quickActionWrapperPresets.splice(indexToDelete, 1);
                this.saveSettings();
                this.renderQuickActionSettings(); // Re-render the list
                this.injectToolbarHTML(true); // Force toolbar refresh
            }
        });
    }

    updateQuickActionSettings() {
        if (!$('#qa-toolbar-enabled').length) return;
        this.settings.quickActionToolbarEnabled = $('#qa-toolbar-enabled').is(':checked');
        // Presets are saved directly by their add/delete handlers.
        this.saveSettings();
        if (this.settings.quickActionToolbarEnabled) {
            this.injectToolbarHTML(true); // Force refresh to show/hide presets
            this.initializeTextSelectionListener();
        } else {
            this.removeTextSelectionListener();
            $('#quick-action-toolbar').remove(); // Remove toolbar if disabled
        }
    }

    injectToolbarHTML(forceRefresh = false) {
        if (forceRefresh && $('#quick-action-toolbar').length > 0) {
            $('#quick-action-toolbar').remove();
        }
        if ($('#quick-action-toolbar').length === 0) {
            let presetButtonsHtml = '';
            if (this.settings.quickActionWrapperPresets && this.settings.quickActionToolbarEnabled) {
                this.settings.quickActionWrapperPresets.forEach(preset => {
                    presetButtonsHtml += `<button data-action="wrap-custom-preset" data-start="${$('<div>').text(preset.start).html()}" data-end="${$('<div>').text(preset.end).html()}" title="Wrap with ${$('<div>').text(preset.name).html()}">${$('<div>').text(preset.name).html()}</button>`;
                });
            }

            const baseToolbarHtml = `
                <button data-action="wrap-asterisk" title="Wrap in *">*Wrap*</button>
                <button data-action="wrap-underscore" title="Wrap in _">_Wrap_</button>
                <button data-action="wrap-quotes" title="Wrap in &quot;">"Wrap"</button>
                ${presetButtonsHtml}
                <button data-action="wrap-custom" title="Custom Wrap">Custom...</button>
                <button data-action="remove-wrappers" title="Remove Wrappers">Rm Wraps</button>
                <button data-action="delete-selection" style="color: red;" title="Delete Selection">Delete</button>
                <select data-action="case-change" title="Change Case">
                    <option value="">Case...</option>
                    <option value="sentence">Sentence</option><option value="lower">lowercase</option><option value="upper">UPPERCASE</option>
                </select>
                <button data-action="undo-quick-action" title="Undo Last Quick Action" style="display:none; margin-left: auto; background-color: #ffebcc; color: #542605; border-color: #e0c4a0;">Undo QA</button>`;

            const finalHtml = `<div id="quick-action-toolbar" style="display: none; position: absolute; background-color: #f8f8f8; border: 1px solid #bbb; border-radius: 4px; padding: 5px; box-shadow: 2px 2px 8px rgba(0,0,0,0.25); z-index: 1005; flex-wrap: wrap; gap: 3px;">${baseToolbarHtml}</div>`;
            $('body').append(finalHtml);
            this.bindToolbarActions();
        }
    }
    bindToolbarActions() {
        const toolbar = $('#quick-action-toolbar');
        // Ensure toolbar exists, if not, inject it (e.g., if called before initial setup)
        if (!toolbar.length) {
            if (this.settings.quickActionToolbarEnabled) { // Only inject if enabled
                this.injectToolbarHTML();
            } else {
                return; // Do not bind if toolbar is not meant to be there
            }
        }
        // Re-fetch toolbar in case it was just injected
        const currentToolbar = $('#quick-action-toolbar');
        if (!currentToolbar.length) return; // Still no toolbar, exit

        currentToolbar.off('click.qaActions').on('click.qaActions', 'button[data-action]', (e) => {
            const button = $(e.currentTarget);
            const action = button.data('action');
            let value = null;
            if (action === 'wrap-custom-preset') {
                value = { start: button.data('start'), end: button.data('end') };
            }
            this.handleQuickAction(action, value); // Pass value for custom presets
            e.stopPropagation();
        });
        currentToolbar.off('change.qaActions').on('change.qaActions', 'select[data-action="case-change"]', (e) => {
            const select = $(e.currentTarget);
            const action = select.data('action');
            const val = select.val();
            if (val) {
                this.handleQuickAction(action, val);
            }
            e.stopPropagation();
            select.val(""); // Reset select
        });
    }

    handleQuickAction(action, value = null) {
        const toolbar = $('#quick-action-toolbar');
        const details = toolbar.data('selectionDetails'); // May be undefined if no selection (e.g. direct click on Undo QA)

        if (action === 'undo-quick-action') {
            const targetEl = toolbar.data('qa-target-element');
            const undoState = $(targetEl).data('qa-undo-state');
            if (targetEl && undoState !== undefined) {
                const $targetEl = $(targetEl);
                if ($targetEl.is('textarea, input')) {
                    $targetEl.val(undoState);
                    $targetEl.trigger('input'); // For compatibility with frameworks/event listeners
                } else { // Assumed contenteditable (like .mes_text)
                    $targetEl.html(undoState); // Restore HTML to preserve any internal structure
                    if ($targetEl.hasClass('mes_text')) {
                        const $mesDiv = $targetEl.closest('.mes');
                        const mesId = $mesDiv.attr('mesid');
                        const msgIndex = parseInt(mesId, 10);
                        const context = getContext();
                        if (!isNaN(msgIndex) && context.chat && context.chat[msgIndex]) {
                            // Update data model based on the restored HTML's text content
                            context.chat[msgIndex].mes = $targetEl.text();
                            // No need to call coreMessageFormatting, HTML is restored.
                            coreSaveChatDebounced();
                        }
                    }
                }
                $(targetEl).removeData('qa-undo-state');
                toolbar.find('button[data-action="undo-quick-action"]').hide();
                toolbar.removeData('qa-target-element');
            }
            return; // Undo action is done
        }

        if (!details || !details.selection || !details.selection.rangeCount) {
            // If no selection, and not an undo action, hide toolbar and return
            toolbar.hide();
            // Clear stale undo state too if selection is lost
            const undoButton = toolbar.find('button[data-action="undo-quick-action"]');
            if (undoButton.is(':visible')) {
                const undoTarget = toolbar.data('qa-target-element');
                if (undoTarget) $(undoTarget).removeData('qa-undo-state');
                undoButton.hide();
                toolbar.removeData('qa-target-element');
            }
            return;
        }

        const selection = details.selection; const range = selection.getRangeAt(0); const selectedText = selection.toString();
        let newText = selectedText; let replaced = false;
        let originalContent = null;

        const $messageElementForUndo = $(details.messageElement);
        if ($messageElementForUndo.is('textarea, input')) {
            originalContent = $messageElementForUndo.val();
        } else {
            originalContent = $messageElementForUndo.html();
        }

        switch (action) {
            case 'wrap-asterisk': newText = `*${selectedText}*`; replaced = true; break;
            case 'wrap-underscore': newText = `_${selectedText}_`; replaced = true; break;
            case 'wrap-quotes': newText = `"${selectedText}"`; replaced = true; break;
            case 'wrap-custom-preset':
                if (value && value.start !== undefined && value.end !== undefined) {
                    newText = `${value.start}${selectedText}${value.end}`;
                    replaced = true;
                }
                break;
            case 'wrap-custom':
                const cw = prompt("Wrappers (e.g., <,> or just <tag> for self-closing)", details.lastCustomWrap || "");
                if (cw) {
                    details.lastCustomWrap = cw;
                    toolbar.data('selectionDetails', details);
                    const parts = cw.split(',');
                    const startWrapper = parts[0].trim();
                    const endWrapper = (parts.length > 1) ? parts[1].trim() : "";
                    newText = `${startWrapper}${selectedText}${endWrapper}`;
                    replaced = true;
                }
                break;
            case 'remove-wrappers':
                if (selectedText.length >= 2) {
                    const f=selectedText[0];
                    const l=selectedText[selectedText.length-1];
                    if ((f==='*'&&l==='*')||(f==='_'&&l==='_')||(f==='"'&&l==='"')||
                        (f==='('&&l===')')||(f==='['&&l===']')||(f==='{'&&l==='}')||
                        (f==='<'&&l==='>')) {
                        newText=selectedText.slice(1,-1); replaced=true;
                    }
                } break;
            case 'delete-selection':
                newText = '';
                replaced = true;
                break;
            case 'case-change':
                if (value==='sentence') newText=this._toSentenceCaseHelper(selectedText);
                else if (value==='lower') newText=selectedText.toLowerCase();
                else if (value==='upper') newText=selectedText.toUpperCase();
                replaced=true;
                break;
        }

        if (replaced) {
            if (originalContent !== null && originalContent !== newText) { // Only store if content actually changed
                $($messageElementForUndo).data('qa-undo-state', originalContent);
                toolbar.data('qa-target-element', details.messageElement);
                toolbar.find('button[data-action="undo-quick-action"]').show();
            } else { // If no actual change or no original content, ensure Undo is hidden
                toolbar.find('button[data-action="undo-quick-action"]').hide();
                $(details.messageElement).removeData('qa-undo-state');
                toolbar.removeData('qa-target-element');
            }

            range.deleteContents();
            range.insertNode(document.createTextNode(newText));

            const $messageElement = $(details.messageElement); // This is the same as $messageElementForUndo
            if ($messageElement.hasClass('mes_text')) {
                const $mesDiv = $messageElement.closest('.mes');
                const mesId = $mesDiv.attr('mesid');
                const msgIndex = parseInt(mesId, 10);
                const context = getContext();

                if (!isNaN(msgIndex) && context.chat && context.chat[msgIndex]) {
                    const updatedFullMesText = $messageElement.text();
                    context.chat[msgIndex].mes = updatedFullMesText;
                    $messageElement.html(coreMessageFormatting(context.chat[msgIndex].mes, context.chat[msgIndex].name, context.chat[msgIndex].is_system, context.chat[msgIndex].is_user, msgIndex));
                    coreSaveChatDebounced();
                } else {
                    console.error("QA Error: Could not find message to save for Quick Action.", details); // Keep error log
                }
            } else if ($messageElement.is('#send_textarea, #char_edit_textarea, #note_text_area')) {
                $messageElement.trigger('input');
            }

            selection.removeAllRanges();
            // toolbar.hide().removeData('selectionDetails'); // Keep toolbar visible for Undo
        }
    }
    _toSentenceCaseHelper(str) { /* ... (already implemented) ... */
        const cf = this.tools.find(t => t.constructor.name === "CaseFormatterTool"); if (cf && typeof cf.toSentenceCase === 'function') return cf.toSentenceCase(str);
        if (!str || str.length === 0) return ""; let s = str.trim(); if (!s) return str; return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
    }
    initializeTextSelectionListener() { /* ... (already implemented) ... */
        if (!this.settings.quickActionToolbarEnabled) return;
        $(document).off('mouseup.qaToolbar').on('mouseup.qaToolbar', (e) => {
            if (!this.settings.quickActionToolbarEnabled) return;
            const sel = window.getSelection(); const txt = sel.toString().trim(); let tb = $('#quick-action-toolbar');
            if (!tb.length) {
                this.injectToolbarHTML(); tb = $('#quick-action-toolbar');
                if(!tb.length) return; // Still no toolbar, exit
            }
            const $target = $(e.target);
            const $msgEl = $target.closest('.mes_text, #send_textarea, #char_edit_textarea, #note_text_area');
            const $isInsideFormatterModal = $target.closest('#formatterToolboxModal').length > 0;
            const $isInsideQuickActionToolbar = $target.closest('#quick-action-toolbar').length > 0;
            const $undoButton = tb.find('button[data-action="undo-quick-action"]');

            if (txt && $msgEl.length > 0 && !$isInsideQuickActionToolbar && !$isInsideFormatterModal) {
                // New selection made, hide Undo button from previous action if it wasn't used and target is different
                const currentTargetElementForUndo = tb.data('qa-target-element');
                if ($undoButton.is(':visible') && details.messageElement !== currentTargetElementForUndo) {
                    if (currentTargetElementForUndo) $(currentTargetElementForUndo).removeData('qa-undo-state');
                    $undoButton.hide();
                    tb.removeData('qa-target-element');
                }
                tb.css({top: e.pageY + 10 + 'px', left: Math.min(e.pageX, window.innerWidth - tb.outerWidth() - 10) + 'px', display: 'flex'})
                  .data('selectionDetails', { selection: sel, messageElement: $msgEl[0], lastCustomWrap: tb.data('selectionDetails')?.lastCustomWrap || ""});
            } else if (!$isInsideQuickActionToolbar) {
                tb.hide().removeData('selectionDetails');
                if ($undoButton.is(':visible')) { // Also hide Undo button if toolbar is hidden
                    const undoTarget = tb.data('qa-target-element');
                    if (undoTarget) $(undoTarget).removeData('qa-undo-state');
                    $undoButton.hide();
                    tb.removeData('qa-target-element');
                }
            }
        });
        $(document).off('mousedown.qaToolbarHide').on('mousedown.qaToolbarHide', (e) => {
            const tb = $('#quick-action-toolbar');
            if (tb.is(':visible') && !$(e.target).closest('#quick-action-toolbar').length && window.getSelection().isCollapsed) {
                tb.hide().removeData('selectionDetails');
                const undoButton = tb.find('button[data-action="undo-quick-action"]');
                if (undoButton.is(':visible')) {
                    const undoTarget = tb.data('qa-target-element');
                    if (undoTarget) $(undoTarget).removeData('qa-undo-state');
                    undoButton.hide();
                    tb.removeData('qa-target-element');
                }
            }
        });
        $(window).off('scroll.qaToolbarHide').on('scroll.qaToolbarHide', () => {
            const tb = $('#quick-action-toolbar');
            if (tb.is(':visible')) {
                tb.hide().removeData('selectionDetails');
                const undoButton = tb.find('button[data-action="undo-quick-action"]');
                if (undoButton.is(':visible')) {
                    const undoTarget = tb.data('qa-target-element');
                    if (undoTarget) $(undoTarget).removeData('qa-undo-state');
                    undoButton.hide();
                    tb.removeData('qa-target-element');
                }
            }
        });
    }
    removeTextSelectionListener() { /* ... (already implemented) ... */
        $(document).off('mouseup.qaToolbar mousedown.qaToolbarHide'); $(window).off('scroll.qaToolbarHide');
        $('#quick-action-toolbar').hide().removeData('selectionDetails');
    }

    // Tag Auto-Close Methods
    renderTagAutoCloseSettings() {
        const description = "Purpose: A smart assistant to help fix broken markup generated by the AI. Features: A master toggle switch in the Toolbox to enable or disable this feature. When the user clicks in the chat, the tool scans the text *before* the cursor for an unclosed XML-style tag (e.g., `<think>`). If an unclosed tag is found, a small, non-intrusive popup appears asking, \"Insert `&lt;/think&gt;` here?\". Clicking \"Yes\" instantly inserts the correct closing tag at the cursor's position.";
        $('#tab-tag-autoclose .tool-description').html(description);

        if (!$('#tac-enabled').length) return;
        const settings = this.settings;
        if (settings.tagAutoCloseEnabled === undefined) {
            settings.tagAutoCloseEnabled = false;
        }
        $('#tac-enabled').prop('checked', settings.tagAutoCloseEnabled);
    }

    updateTagAutoCloseSettings() {
        if (!$('#tac-enabled').length) return;
        this.settings.tagAutoCloseEnabled = $('#tac-enabled').is(':checked');
        this.saveSettings();
        if (this.settings.tagAutoCloseEnabled) {
            this.initializeTagAutoCloseListener();
        } else {
            this.removeTagAutoCloseListener();
        }
    }

    initializeTagAutoCloseListener() {
        if (!this.settings.tagAutoCloseEnabled) return;
        $('body').off('mouseup.tac keyup.tac', '#send_textarea').on('mouseup.tac keyup.tac', '#send_textarea', (e) => {
            if (!this.settings.tagAutoCloseEnabled) return;
            setTimeout(() => this.checkAndSuggestTagClose(e.target), 50);
        });
    }

    removeTagAutoCloseListener() {
        $('body').off('mouseup.tac keyup.tac', '#send_textarea');
        this.hideTagAutoClosePopup();
    }

    checkAndSuggestTagClose(targetElement) {
        if (!targetElement || typeof targetElement.value !== 'string' || typeof targetElement.selectionStart !== 'number') {
            this.hideTagAutoClosePopup(); return;
        }
        const text = targetElement.value;
        const cursorPos = targetElement.selectionStart;
        const textBeforeCursor = text.substring(0, cursorPos);
        let openTagsStack = [];
        const allTagsRegex = /<\/?([a-zA-Z0-9_:-]+)(?:\s[^>]*)?\/?>/g;
        let match;
        while((match = allTagsRegex.exec(textBeforeCursor)) !== null) {
            const tagName = match[1];
            const isClosingTag = match[0].startsWith('</');
            const isSelfClosing = match[0].endsWith('/>');
            if (isSelfClosing) continue;
            if (isClosingTag) {
                if (openTagsStack.length > 0 && openTagsStack[openTagsStack.length - 1] === tagName) openTagsStack.pop();
            } else {
                openTagsStack.push(tagName);
            }
        }
        const lastUnclosedTag = openTagsStack.pop() || null;

        if (lastUnclosedTag) {
            // Condition 0: Empty text before cursor or only whitespace
            if (textBeforeCursor.trim() === '') {
                this.hideTagAutoClosePopup(); return;
            }

            const charJustBeforeCursor = textBeforeCursor.charAt(cursorPos - 1);

            // Condition 1: Cursor is still inside a tag definition (e.g., <tag| or <tag attr|)
            // If the last '<' is after the last '>', we are likely inside a tag.
            const lastOpenAngle = textBeforeCursor.lastIndexOf('<');
            const lastCloseAngle = textBeforeCursor.lastIndexOf('>');
            if (lastOpenAngle > lastCloseAngle) {
                 this.hideTagAutoClosePopup(); return;
            }

            // Condition 2: Cursor is right after the opening tag (e.g. <tag>|)
            // Test if textBeforeCursor ends with an opening tag pattern for the lastUnclosedTag.
            // Regex: /<tagName(?:\\s[^>]*)?>$/
            // Example: <tag attr="value"> immediately followed by cursor.
            // We need to escape lastUnclosedTag if it contains special regex characters, though tag names usually don't.
            const escapedLastUnclosedTag = lastUnclosedTag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const openTagPattern = new RegExp(`<${escapedLastUnclosedTag}(?:\\s[^>]*)?>$`);
            if (openTagPattern.test(textBeforeCursor)) {
                 this.hideTagAutoClosePopup(); return;
            }

            // Condition 3: Cursor is inside an attribute's quotes.
            // This is a more specific version of Condition 1, good to keep.
            // Example: <tag attr="val|" or <tag attr='val|'
            const textAroundCursor = text.substring(Math.max(0, cursorPos - 10), Math.min(text.length, cursorPos + 10));
            if (textAroundCursor.match(/=\s*["'][^"']*$/) && charJustBeforeCursor !== '"' && charJustBeforeCursor !== "'") { // Inside quote, but not AT the end quote
                 //This regex is a bit broad, let's simplify: if charBefore is part of an unterminated attribute value.
                 //The (lastOpenAngle > lastCloseAngle) should largely cover this.
                 //The original check was: (charJustBeforeCursor === '"' && charTwoBeforeCursor === '=')
                 //This is too specific (only for just after attr=").
                 //A simple check: if the character before cursor is not '>' and we are in a tag (covered by cond 1)
            }
            // Condition 3 simplified: if inside a quote that's part of an attribute
            // Check if there's an unclosed quote for an attribute before the cursor
            // This specific check might be overly complex if Condition 1 (lastOpenAngle > lastCloseAngle) is robust enough.
            // For now, we'll rely on Condition 1 to prevent showing inside tag definitions.
            // const textBeforeCursorNoTags = textBeforeCursor.substring(lastCloseAngle + 1);
            // let inQuote = null;
            // for (let i = 0; i < textBeforeCursorNoTags.length; i++) {
            //     if (textBeforeCursorNoTags[i] === '"' || textBeforeCursorNoTags[i] === "'") {
            //         if (inQuote === textBeforeCursorNoTags[i]) inQuote = null;
            //         else if (inQuote === null) inQuote = textBeforeCursorNoTags[i];
            //     }
            // }
            // if (inQuote !== null && lastOpenAngle > lastCloseAngle) {
            //      this.hideTagAutoClosePopup(); return;
            // }

            // Condition 4: Don't show if Quick Action Toolbar is already visible (to avoid overlapping popups)
            if ($('#quick-action-toolbar').is(':visible')) {
                this.hideTagAutoClosePopup(); return;
            }

            this.showTagAutoClosePopup(targetElement, lastUnclosedTag);
        } else {
            this.hideTagAutoClosePopup();
        }
    }

    getCursorPixelPosition(inputElement) {
        let $mirrorDiv = $('#tac-mirror-div');
        if (!$mirrorDiv.length) {
            $mirrorDiv = $('<div id="tac-mirror-div" style="position:absolute;top:-9999px;left:-9999px;white-space:pre-wrap;visibility:hidden;overflow:auto;"></div>').appendTo('body');
        }
        const style = window.getComputedStyle(inputElement);
        $mirrorDiv.css({
            'font': style.font, 'letter-spacing': style.letterSpacing, 'text-transform': style.textTransform,
            'word-spacing': style.wordSpacing, 'padding': style.padding, 'border-width': style.borderLeftWidth,
            'border-style': style.borderLeftStyle, 'width': $(inputElement).width() + 'px', 'box-sizing': style.boxSizing,
        });
        const textUptoCursor = inputElement.value.substring(0, inputElement.selectionStart);
        const mirrorText = textUptoCursor.replace(/ /g, '\u00a0').replace(/\n/g, '<br/>') + '<span>&nbsp;</span>';
        $mirrorDiv.html(mirrorText);
        const $span = $mirrorDiv.find('span');
        const spanOffset = $span.position() || { top: 0, left: 0 }; // Fallback for safety
        const inputRect = inputElement.getBoundingClientRect();
        return {
            top: inputRect.top + window.scrollY + spanOffset.top - inputElement.scrollTop + parseFloat(style.borderTopWidth || 0),
            left: inputRect.left + window.scrollX + spanOffset.left - inputElement.scrollLeft + parseFloat(style.borderLeftWidth || 0)
        };
    }

    showTagAutoClosePopup(targetInputElement, tagName) {
        this.hideTagAutoClosePopup();
        const popupHTML = `<div id="tag-autoclose-popup" style="position:absolute;">Insert <code>&lt;/${tagName}&gt;</code>?</div>`;
        $('body').append(popupHTML);
        const $popup = $('#tag-autoclose-popup');
        const pos = this.getCursorPixelPosition(targetInputElement);
        $popup.css({
            top: (pos.top - ($popup.outerHeight() || 20) - 10) + 'px',
            left: Math.min(pos.left, window.innerWidth - ($popup.outerWidth() || 100) - 15) + 'px',
            display: 'block'
        });
        $popup.data('tagName', tagName);
        $popup.data('targetElement', targetInputElement);
        $popup.off('click.tacInsert').on('click.tacInsert', (e) => {
            e.stopPropagation();
            const tagToInsert = `</${$popup.data('tagName')}>`;
            const el = $popup.data('targetElement');
            const start = el.selectionStart;
            const currentVal = el.value;
            el.value = currentVal.substring(0, start) + tagToInsert + currentVal.substring(start);
            const newCursorPos = start + tagToInsert.length;
            el.selectionStart = el.selectionEnd = newCursorPos;
            $(el).trigger('input');
            this.hideTagAutoClosePopup();
            el.focus();
        });
        setTimeout(() => {
            $(document).off('mousedown.tacPopupHide').one('mousedown.tacPopupHide', (e) => {
                if (!$popup.is(e.target) && $popup.has(e.target).length === 0 && !$(e.target).is(targetInputElement)) {
                    this.hideTagAutoClosePopup();
                }
            });
            $(targetInputElement).off('keydown.tacPopupHide').one('keydown.tacPopupHide', () => this.hideTagAutoClosePopup());
        }, 0);
    }

    hideTagAutoClosePopup() {
        $('#tag-autoclose-popup').remove();
        $(document).off('mousedown.tacPopupHide');
    }

    // End of Tag Auto-Close Methods

    formatMessage(message, formatAllSwipes = false) {
        if (message.is_user || !message.mes) {
            return false;
        }

        if (!message.extra) {
            message.extra = {};
        }

        if (message.extra.original_mes === undefined) {
            message.extra.original_mes = message.mes;
        }
        message.extra.pre_format_mes = message.mes;

        if (!Array.isArray(message.swipes)) {
            message.swipes = [message.mes];
            message.swipe_id = 0;
        }

        if (message.extra.original_swipes === undefined) {
            message.extra.original_swipes = [...message.swipes];
        }
        message.extra.pre_format_swipes = [...message.swipes];

        let modified = false;

        const applyPipeline = (textToFormat) => {
            let currentText = textToFormat;
            // Ensure toolOrder is valid and synchronized with this.tools
            const currentToolNames = this.tools.map(tool => tool.constructor.name);
            if (!this.settings.toolOrder || this.settings.toolOrder.length === 0 ||
                !this.settings.toolOrder.every(toolName => currentToolNames.includes(toolName)) ||
                 this.settings.toolOrder.length !== currentToolNames.length) {
                 // This sync logic should ideally be in loadSettings or a dedicated sync method
                 // For now, just use the current order of this.tools if toolOrder is invalid
                console.warn("FormatterToolbox: Tool order mismatch or not set, using default order.");
                this.settings.toolOrder = [...currentToolNames]; // Fallback to default order
            }

            for (const toolName of this.settings.toolOrder) {
                const tool = this.tools.find(t => t.constructor.name === toolName);
                if (tool && typeof tool.process === 'function') {
                    currentText = tool.process(currentText, this.settings);
                }
            }
            return currentText;
        };

        const formattedMainMes = applyPipeline(message.mes);
        if (formattedMainMes !== message.mes) {
            message.mes = formattedMainMes;
            modified = true;
        }

        if (Array.isArray(message.swipes)) {
            const processSwipe = (swipeText) => applyPipeline(swipeText);
            if (formatAllSwipes) {
                for (let i = 0; i < message.swipes.length; i++) {
                    const formattedSwipe = processSwipe(message.swipes[i]);
                    if (message.swipes[i] !== formattedSwipe) {
                        message.swipes[i] = formattedSwipe;
                        modified = true;
                    }
                }
            } else {
                const swipeIndex = message.swipe_id || 0;
                if (message.swipes[swipeIndex] !== undefined) {
                    const formattedSwipe = processSwipe(message.swipes[swipeIndex]);
                    if (message.swipes[swipeIndex] !== formattedSwipe) {
                        message.swipes[swipeIndex] = formattedSwipe;
                        modified = true;
                    }
                }
            }
        }
        return modified;
    }

    formatAllAiMessages(formatAllSwipes = false) { /* ... (no changes needed) ... */
        const context = getContext();
        if (!context.chat) { return false; }
        let modified = false;
        context.chat.forEach((message) => {
            if (!message.is_user) {
                if (this.formatMessage(message, formatAllSwipes)) {
                    modified = true;
                    const mesIndex = context.chat.indexOf(message);
                    const messageElement = document.querySelector(`.mes[mesid="${mesIndex}"] .mes_text`);
                    if (messageElement) {
                        messageElement.innerHTML = coreMessageFormatting(message.mes, message.name, message.is_system, message.is_user, mesIndex);
                    }
                }
            }
        });
        if (modified) { coreSaveChatDebounced(); }
        return modified;
    }
    undoFormatMessage(message) { /* ... (no changes needed) ... */
        if (message.is_user || !message.extra || message.extra.pre_format_mes === undefined) { return false; }
        let modified = false;
        if (message.mes !== message.extra.pre_format_mes) { message.mes = message.extra.pre_format_mes; modified = true; }
        if (Array.isArray(message.swipes) && Array.isArray(message.extra.pre_format_swipes)) {
            for (let i = 0; i < message.swipes.length; i++) {
                if (message.extra.pre_format_swipes[i] !== undefined && message.swipes[i] !== message.extra.pre_format_swipes[i]) {
                    message.swipes[i] = message.extra.pre_format_swipes[i]; modified = true;
                }
            }
        }
        if (modified) { delete message.extra.pre_format_mes; delete message.extra.pre_format_swipes; }
        return modified;
    }
    undoFormatAll() { /* ... (no changes needed) ... */
        const context = getContext();
        if (!context.chat) { return false; }
        let modified = false;
        context.chat.forEach((message) => {
            if (this.undoFormatMessage(message)) {
                modified = true;
                const mesIndex = context.chat.indexOf(message);
                const messageElement = document.querySelector(`.mes[mesid="${mesIndex}"] .mes_text`);
                if (messageElement) {
                    messageElement.innerHTML = coreMessageFormatting(message.mes, message.name, message.is_system, message.is_user, mesIndex);
                }
            }
        });
        if (modified) { coreSaveChatDebounced(); }
        return modified;
    }
    formatLastAiMessage() { /* ... (no changes needed) ... */
        const context = getContext();
        if (!context.chat || context.chat.length === 0) return false;
        const msgIndex = context.chat.length - 1; const message = context.chat[msgIndex];
        if (!message || message.is_user || !message.mes) return false;
        if (this.formatMessage(message, false)) {
            const messageElement = document.querySelector(`.mes[mesid="${msgIndex}"] .mes_text`);
            if (messageElement) { messageElement.innerHTML = coreMessageFormatting(message.mes, message.name, message.is_system, message.is_user, msgIndex); }
            coreSaveChatDebounced(); return true;
        } return false;
    }
    undoFormatLastAiMessage() { /* ... (no changes needed) ... */
        const context = getContext();
        if (!context.chat || context.chat.length === 0) return false;
        const msgIndex = context.chat.length - 1; const message = context.chat[msgIndex];
        if (!message || message.is_user || !message.extra || message.extra.original_mes === undefined) return false;
        if (this.undoFormatMessage(message)) {
            const messageElement = document.querySelector(`.mes[mesid="${msgIndex}"] .mes_text`);
            if (messageElement) { messageElement.innerHTML = coreMessageFormatting(message.mes, message.name, message.is_system, message.is_user, msgIndex); }
            coreSaveChatDebounced(); return true;
        } return false;
    }
    onMessageUpdate(msgIndex) {
        const context = getContext();
        if (msgIndex >= context.chat.length || msgIndex < 0) return;
        const message = context.chat[msgIndex];

        // Only concerned with AI messages that this extension might have an interest in.
        // If it hasn't been formatted before (no original_mes), or formatter is disabled, ignore.
        if (!this.settings.enabled || !message || message.is_user || !message.extra || message.extra.original_mes === undefined) {
            return;
        }

        // If a message previously touched by the formatter is edited,
        // its current state becomes the new "pre-format" state for any *future* explicit formatting actions.
        // This ensures that manual edits "stick" until the next explicit format command.
        message.extra.pre_format_mes = message.mes;
        if (Array.isArray(message.swipes)) {
            // Ensure pre_format_swipes matches the structure of swipes if it exists
            message.extra.pre_format_swipes = message.swipes.map(s => s); // Create new array
        } else {
            delete message.extra.pre_format_swipes; // Clear if swipes array no longer exists
        }
        // No coreSaveChatDebounced() here. This method's responsibility is to update the formatter's
        // internal understanding of the "pre-format" state. The core application handles saving
        // the edited message content. This also prevents format-on-edit if autoFormat is off.
    }
}

// All Tool Classes (FindAndReplaceTool, ParagraphControlTool, StyleMapperTool, SmartPunctuationTool, CaseFormatterTool)
// ... (These are already defined above/in previous steps and assumed to be part of the complete code block) ...
class FindAndReplaceTool {
    constructor() {}
    process(text, settings) {
        const rules = settings.findAndReplaceRules || []; let currentText = text;
        for (const rule of rules) {
            if (rule.enabled && rule.find) {
                try {
                    if (rule.isRegex) { const regex = new RegExp(rule.find, rule.caseSensitive ? 'g' : 'gi'); currentText = currentText.replace(regex, rule.replaceWith || ''); }
                    else { const escapedFind = rule.find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); const regex = new RegExp(escapedFind, rule.caseSensitive ? 'g' : 'gi'); currentText = currentText.replace(regex, rule.replaceWith || '');}
                } catch (e) { console.error("FindAndReplaceTool: Error processing rule", rule, e); }
            }
        } return currentText;
    }
}
class ParagraphControlTool {
    constructor() {}
    process(text, settings) {
        const mode = settings.paragraphControlMode; const maxParas = settings.paragraphControlMax || 1; const minParas = settings.paragraphControlMin || 1;
        let currentText = text.trim(); if (!mode || mode === 'none') { return text; }
        let paragraphs = currentText.split(/\r?\n/g).filter(p => p.trim() !== '');
        switch (mode) {
            case 'single': currentText = paragraphs.join(' '); break;
            case 'max': if (paragraphs.length > maxParas) { currentText = paragraphs.slice(0, maxParas).join('\n\n'); } else { currentText = paragraphs.join('\n\n'); } break;
            case 'min': currentText = paragraphs.join('\n\n'); break; // Simplified as per previous logic
            default: return text;
        }
        if (mode !== 'single') { currentText = currentText.replace(/(\r?\n){3,}/g, '\n\n'); }
        return currentText;
    }
}
class StyleMapperTool {
    constructor() {}
    process(text, settings) {
        const rules = settings.styleMapperRules || []; let currentText = text;
        for (const rule of rules) {
            if (rule.enabled && rule.findRegex && rule.tagName && rule.replacePattern) {
                try { const regex = new RegExp(rule.findRegex, 'g'); let finalReplacePattern = rule.replacePattern.replace(/\$TAG_START/g, `__TAG_START_${rule.tagName}__`).replace(/\$TAG_END/g, `__TAG_END_${rule.tagName}__`); currentText = currentText.replace(regex, finalReplacePattern);
                } catch (e) { console.error("StyleMapperTool: Error processing rule", rule, e); }
            }
        } return currentText;
    }
}
class SmartPunctuationTool {
    constructor() {}
    analyzeSentiment(text) {
        const cleanText = text.replace(/__TAG_(START|END)_[^_]+?__/g, ''); const positiveWords = ['good', 'great', 'happy', 'joy']; const negativeWords = ['bad', 'sad', 'angry', 'hate']; let score = 0; const lowerText = cleanText.toLowerCase();
        positiveWords.forEach(word => { const r = new RegExp(`\\b${word}\\b`, 'g'); const m = lowerText.match(r); if (m) score += m.length * 0.1; });
        negativeWords.forEach(word => { const r = new RegExp(`\\b${word}\\b`, 'g'); const m = lowerText.match(r); if (m) score -= m.length * 0.1; });
        return { compound: score };
    }
    process(text, settings) {
        let currentText = text; const targetTagName = settings.smartPunctuationTargetTag || 'dialogue';
        const tagRegex = new RegExp(`(__TAG_START_${targetTagName}__)(.*?)(__TAG_END_${targetTagName}__)`, 'g');
        currentText = currentText.replace(tagRegex, (match, startTag, content, endTag) => {
            let newContent = content;
            if (newContent.endsWith(',')) {
                const sentiment = this.analyzeSentiment(newContent); let replacement = settings.neutralReplacement || '.';
                if (sentiment.compound > (settings.positiveThreshold || 0.05)) { replacement = settings.positiveReplacement || '!'; }
                else if (sentiment.compound < (settings.negativeThreshold || -0.05)) { replacement = settings.negativeReplacement || '...'; }
                newContent = newContent.slice(0, -1) + replacement;
            } return startTag + newContent + endTag;
        }); return currentText;
    }
}
class CaseFormatterTool {
    constructor() {}
    process(text, settings) {
        if (!settings.caseFormatterSentenceCase) return text;
        const tagPattern = /(__TAG_(?:START|END)_[^_]+?__)/g; const parts = text.split(tagPattern);
        const processedParts = parts.map(part => { if (tagPattern.test(part) || part.trim() === '') return part; return this.toSentenceCase(part); });
        return processedParts.join("");
    }
    toSentenceCase(str) {
        if (!str || str.length === 0) return ""; let s = str.trim(); if (!s) return str;
        s = s.charAt(0).toUpperCase() + s.slice(1);
        s = s.replace(/([.!?])(\s+)([a-zA-Z])/g, (m, p1, p2, p3) => p1 + p2 + p3.toUpperCase()); return s;
    }
}


const formatterToolbox = new FormatterToolbox();

function refreshChat() { eventSource.emit(event_types.CHAT_CHANGED, getContext().chatId); }

jQuery(async () => {
    formatterToolbox.loadSettings();

    function addToolboxStyles() {
        const css = `
            #formatterToolboxModal { display: none; position: fixed; z-index: 1001; left: 0; top: 0; width: 100%; height: 100%; overflow: auto; background-color: rgba(0,0,0,0.5); } /* Darker overlay */
            #formatterToolboxModal .modal-content {
                background-color: #f8f8f8; /* Slightly off-white */
                margin: 5% auto; /* Adjusted margin for smaller screens */
                padding: 20px; /* Slightly reduced padding for smaller screens */
                border: 1px solid #bbb; /* More distinct border */
                width: 90%;  /* More responsive width */
                max-width: 750px; /* Keeps a max limit for larger screens */
                border-radius: 6px;
                position: relative;
                color: #333; /* Darker base text color */
                font-size: 1em; /* Base font size */
                box-shadow: 0 5px 15px rgba(0,0,0,0.2);
                max-height: 90vh; /* Max height for viewport */
                overflow-y: auto; /* Scroll for overflow */
            }
            #formatterToolboxModal .close-button {
                color: #888; /* Darker close button */
                float: right; font-size: 32px; /* Larger */
                font-weight: bold;
                line-height: 1; /* Better alignment */
            }
            #formatterToolboxModal .close-button:hover,
            #formatterToolboxModal .close-button:focus { color: #black; text-decoration: none; cursor: pointer; }

            .formatter-tabs {
                border-bottom: 1px solid #bbb; /* More distinct border */
                padding-bottom: 0; /* Align with button bottom border */
                margin-bottom: 20px; /* Increased margin */
                display: flex;
                flex-wrap: wrap;
            }
            .formatter-tabs button {
                background-color: #e9e9e9;
                border: 1px solid #bbb;
                border-bottom: none; /* Remove bottom border for unselected */
                padding: 10px 15px; /* More padding */
                cursor: pointer;
                margin-right: 4px;
                border-radius: 4px 4px 0 0;
                position: relative; /* For z-index or future use */
                bottom: -1px; /* To align with content border */
                color: #555; /* Darker text for tabs */
                font-weight: 500;
            }
            .formatter-tabs button.active {
                background-color: #f8f8f8; /* Match content background */
                border-color: #bbb;
                border-bottom: 1px solid #f8f8f8; /* Creates the "connected" look */
                font-weight: bold;
                color: #333;
            }
            .formatter-tabs button:hover:not(.active) {
                background-color: #dcdcdc;
            }

            .tab-content {
                display: none;
                padding: 20px;
                border: 1px solid #bbb; /* More distinct border */
                border-top: 1px solid #bbb; /* Ensure top border is consistent */
                animation: fadeIn 0.3s;
                background-color: #fdfdfd; /* Slightly lighter than modal bg for depth */
                border-radius: 0 0 4px 4px; /* Rounded bottom corners */
            }
            .tab-content.active { display: block; }
            @keyframes fadeIn { from {opacity: 0;} to {opacity: 1;} }

            .tool-description {
                font-size: 0.9em;
                color: #555;
                margin-bottom: 15px;
                padding: 10px;
                background-color: #f0f0f0;
                border-radius: 4px;
                border: 1px solid #e0e0e0;
            }

            /* Rule items (FnR, Style Mapper) */
            .formatter-rule-item {
                display: flex;
                flex-direction: column; /* Stack elements vertically by default on smaller screens */
                gap: 10px;
                padding: 12px;
                border-bottom: 1px solid #e0e0e0; /* Lighter border for items */
                flex-wrap: wrap; /* Still allow wrapping if specific items are side-by-side */
                background-color: #fff;
                border-radius: 3px;
                margin-bottom: 8px;
            }
            @media (min-width: 600px) { /* Apply row layout for wider screens */
                .formatter-rule-item {
                    flex-direction: row;
                    align-items: flex-start;
                }
            }
            .formatter-rule-item:last-child { border-bottom: none; }
            .formatter-rule-item div { display: flex; flex-direction: column; flex-grow: 1; } /* Container for label + input */
            .formatter-rule-item div label { font-size: 0.85em; color: #666; margin-bottom: 3px; }
            .formatter-rule-item input[type="text"],
            .formatter-rule-item textarea { /* Assuming textareas might be used */
                flex-basis: 180px; /* Adjust basis */
                flex-grow: 1;
                padding: 8px;
                border: 1px solid #ccc;
                border-radius: 4px;
                font-size: 0.95em;
            }
             .formatter-rule-item input[type="text"]:focus,
             .formatter-rule-item textarea:focus {
                border-color: #88aaff;
                box-shadow: 0 0 3px rgba(100, 150, 255, 0.5);
                outline: none;
            }
            .formatter-rule-item .rule-options label { /* For checkboxes */
                margin-bottom: 0;
                display: flex;
                align-items: center;
                white-space: nowrap;
                font-size: 0.9em;
                color: #555;
                margin-right:10px;
            }
            .formatter-rule-item input[type="checkbox"] {
                margin-right: 5px;
                vertical-align: middle;
                height: 1em; width: 1em; /* Consistent checkbox size */
            }
            .formatter-rule-item .fnr-delete-rule, .formatter-rule-item .sm-delete-rule { margin-left: auto; align-self: center; }


            #sm-rules-container, #fnr-rules-container {
                margin-bottom: 15px;
                max-height: 350px; /* More height */
                overflow-y: auto;
                border: 1px solid #ddd;
                padding: 10px;
                background-color: #f9f9f9;
                border-radius: 4px;
            }

            /* Tool Order List */
            #tool-order-list {
                border: 1px solid #bbb;
                padding: 15px;
                border-radius: 4px;
                background-color: #f5f5f5;
                min-height:60px;
            }
            .tool-order-item {
                padding: 10px 15px;
                background-color: #fff;
                border: 1px solid #ccc;
                margin-bottom: 6px;
                border-radius: 4px;
                cursor: grab;
                user-select: none;
                font-weight: 500;
                color: #444;
                box-shadow: 0 1px 2px rgba(0,0,0,0.05);
            }
            .tool-order-item:last-child { margin-bottom: 0; }
            .tool-order-item.dragging { opacity: 0.6; background: #e8e8e8; border-color: #bbb; }

            /* General Buttons */
            .formatter-button, button.primary-button { /* Added primary-button class for main add buttons */
                background-color: #e9e9e9;
                border: 1px solid #adadad;
                padding: 8px 15px; /* More padding */
                cursor: pointer;
                border-radius: 4px;
                margin-top: 10px; /* More margin */
                color: #333;
                font-weight: 500;
                transition: background-color 0.15s ease, border-color 0.15s ease;
            }
            .formatter-button:hover, button.primary-button:hover {
                background-color: #d5d5d5;
                border-color: #999;
            }
            .formatter-button.delete {
                background-color: #ffe0e0;
                border-color: #ffb0b0;
                color: #c00;
            }
            .formatter-button.delete:hover {
                background-color: #ffcfcf;
                border-color: #ffa0a0;
            }

            /* Settings items (General, Paragraph Control etc.) */
            .formatter-setting-item {
                display: flex;
                flex-direction: column; /* Stack label and input vertically on small screens */
                align-items: flex-start; /* Align items to the start */
                margin-bottom: 15px;
                gap: 8px; /* Reduced gap for vertical layout */
                padding: 10px;
                border-radius: 4px;
                background-color: #fff;
                border: 1px solid #e0e0e0;
            }
            @media (min-width: 600px) { /* Apply row layout for wider screens */
                .formatter-setting-item {
                    flex-direction: row;
                    align-items: center;
                    gap: 15px;
                }
            }
            .formatter-setting-item label {
                min-width: auto; /* Allow label to take natural width in vertical layout */
                font-size: 0.95em;
                color: #444;
                font-weight: 500;
                margin-bottom: 0; /* Reset margin */
                display: inline-block;
                vertical-align: middle;
            }
            @media (min-width: 600px) {
                .formatter-setting-item label {
                    min-width: 200px; /* Restore min-width for row layout */
                }
            }
            .formatter-setting-item select,
            .formatter-setting-item input[type="number"],
            .formatter-setting-item input[type="text"],
            .formatter-setting-item input[type="checkbox"] {
                padding: 8px;
                border-radius: 4px;
                border: 1px solid #ccc;
                font-size: 0.95em;
                flex-grow: 1;
                background-color: #fff;
                vertical-align: middle;
                width: 100%; /* Make inputs take full width in vertical layout */
                box-sizing: border-box; /* Ensure padding doesn't break layout */
            }
             .formatter-setting-item input[type="checkbox"] {
                flex-grow: 0;
                margin-right: 5px;
                width: auto; /* Checkboxes should not be full width */
            }
            @media (min-width: 600px) {
                .formatter-setting-item select,
                .formatter-setting-item input[type="number"],
                .formatter-setting-item input[type="text"] {
                    width: auto; /* Revert to auto width for row layout */
                }
            }
            .formatter-setting-item select:focus,
            .formatter-setting-item input[type="number"]:focus,
            .formatter-setting-item input[type="text"]:focus {
                border-color: #88aaff;
                box-shadow: 0 0 3px rgba(100, 150, 255, 0.5);
                outline: none;
            }

            /* Specific Section Titles (Example - could be a class on h3/h4) */
            .tab-content h3, .tab-content h4 {
                color: #555;
                font-weight: bold;
                margin-top: 10px;
                margin-bottom: 15px;
                padding-bottom: 5px;
                border-bottom: 1px solid #eee;
            }
            .tab-content h3:first-child, .tab-content h4:first-child { margin-top: 0; }


            /* Quick Action Toolbar & Tag Autoclose Popup - Minor touch-ups */
            #quick-action-toolbar {
                border: 1px solid #bbb; /* Darker border */
                box-shadow: 2px 2px 8px rgba(0,0,0,0.25); /* Enhanced shadow */
                background-color: #f8f8f8; /* Consistent background */
            }
            #quick-action-toolbar button, #quick-action-toolbar select {
                margin: 3px;
                padding: 6px 10px;
                border: 1px solid #ccc;
                background-color: #f0f0f0;
                cursor: pointer;
                border-radius: 3px;
                font-size: 0.9em;
            }
            #quick-action-toolbar button:hover, #quick-action-toolbar select:hover { background-color: #e0e0e0; border-color: #bbb; }

            /* Ensure popups are not too wide on mobile */
            #quick-action-toolbar, #tag-autoclose-popup {
                max-width: 90vw; /* Prevent popups from being wider than viewport */
            }

            #tag-autoclose-popup {
                background-color: #f8f8f8; /* Consistent background */
                border: 1px solid #b0b0b0;
                padding: 8px 12px;
                border-radius: 4px;
                box-shadow: 1px 1px 5px rgba(0,0,0,0.2);
                font-size: 0.9em;
            }
            #tag-autoclose-popup code {
                background-color: #e8e8e8;
                padding: 2px 4px;
                border-radius: 3px;
                border: 1px solid #ddd;
            }
        `;
        $('<style>').prop('type', 'text/css').html(css).appendTo('head');
    }

    function setupToolboxTabs() { /* ... (no changes needed) ... */
        $('body').on('click', '#formatterToolboxModal .formatter-tabs .tab-button', function() {
            const tabId = $(this).data('tab');
            $('#formatterToolboxModal .formatter-tabs .tab-button').removeClass('active'); $(this).addClass('active');
            $('#formatterToolboxModal .tab-content').removeClass('active'); $('#' + tabId).addClass('active');
        });
        $('body').on('click', '#formatterToolboxClose', function() { $('#formatterToolboxModal').hide(); });
    }

    let toolboxHtmlLoaded = false;
    async function loadAndShowToolbox() { /* ... (no changes needed) ... */
        if (!toolboxHtmlLoaded) {
            try {
                const toolboxContent = await $.get(`${extensionFolderPath}/toolbox.html`);
                $('body').append(toolboxContent); addToolboxStyles(); setupToolboxTabs();
                formatterToolbox.initializeDynamicContentTypes(); toolboxHtmlLoaded = true;
            } catch (e) { console.error("FormatterToolbox: Failed to load toolbox.html", e); toastr.error("Failed to load Formatter Toolbox UI."); return; }
        }
        $('#formatterToolboxModal').show();
        if (!$('#formatterToolboxModal .formatter-tabs .tab-button.active').length) {
            $('#formatterToolboxModal .formatter-tabs .tab-button[data-tab="tab-general"]').click();
        } else { const activeTabId = $('#formatterToolboxModal .formatter-tabs .tab-button.active').data('tab'); $('#formatterToolboxModal .tab-content').removeClass('active'); $('#' + activeTabId).addClass('active');}
    }

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'formatter', aliases: ['mf', 'formatsettings'], helpString: 'Opens the Formatter Toolbox panel.', returns: 'void',
        callback: async () => { await loadAndShowToolbox(); }, unnamedArgumentList: [],
    }));
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({ /* ... existing format command ... */ name: 'format', helpString: 'Format current/all AI messages.', returns:'string', callback: async () => { if (!formatterToolbox.settings.enabled) return 'Extension is disabled.'; const mod = formatterToolbox.formatAllAiMessages(false); refreshChat(); toastr.info(mod ? 'Formatted!' : 'No changes.'); return mod ? 'Formatted' : 'No changes.';}}));
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({ /* ... existing undoformat command ... */ name: 'undoformat', aliases: ['unformat'], helpString: 'Undo formatting.', returns:'string', callback: async () => { const mod = formatterToolbox.undoFormatAll(); refreshChat(); toastr.info(mod ? 'Unformatted!' : 'No changes.'); return mod ? 'Unformatted' : 'No changes.';}}));
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({ /* ... existing formatlast command ... */ name: 'formatlast', helpString: 'Format last AI message.', returns:'string', callback: async () => { if (!formatterToolbox.settings.enabled) return 'Extension is disabled.'; const mod = formatterToolbox.formatLastAiMessage(); refreshChat(); toastr.info(mod ? 'Last formatted!' : 'No changes.'); return mod ? 'Last formatted' : 'No changes.';}}));
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({ /* ... existing undoformatlast command ... */ name: 'undoformatlast', aliases: ['unformatlast'], helpString: 'Undo last format.', returns:'string', callback: async () => { const mod = formatterToolbox.undoFormatLastAiMessage(); refreshChat(); toastr.info(mod ? 'Last unformatted!' : 'No changes.'); return mod ? 'Last unformatted' : 'No changes.';}}));
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({ /* ... existing formatall command ... */ name: 'formatall', helpString: 'Format all AI messages (all swipes).', returns:'string', callback: async () => { if (!formatterToolbox.settings.enabled) return 'Extension is disabled.'; const mod = formatterToolbox.formatAllAiMessages(true); refreshChat(); toastr.info(mod ? 'All formatted!' : 'No changes.'); return mod ? 'All formatted' : 'No changes.';}}));
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({ /* ... existing undoformatall command ... */ name: 'undoformatall', aliases: ['unformatall'], helpString: 'Undo all formatting.', returns:'string', callback: async () => { const mod = formatterToolbox.undoFormatAll(); refreshChat(); toastr.info(mod ? 'All unformatted!' : 'No changes.'); return mod ? 'All unformatted' : 'No changes.';}}));

    eventSource.on(event_types.MESSAGE_RECEIVED, async (data) => { /* ... (no changes needed) ... */
        if (formatterToolbox.settings.enabled && formatterToolbox.settings.autoFormat) {
            if (data && data.message && !data.message.is_user) {
                if (formatterToolbox.formatMessage(data.message, true)) { refreshChat(); coreSaveChatDebounced(); }
            }
        }
    });
    eventSource.on(event_types.MESSAGE_UPDATED, (msgIndex) => formatterToolbox.onMessageUpdate(msgIndex));
    eventSource.on(event_types.MESSAGE_EDITED, (msgIndex) => formatterToolbox.onMessageUpdate(msgIndex));
});

/*
// TODO: Future /mf command for command-line settings manipulation
//
// Goal: Allow quick command-line toggling/setting of tool properties.
// Command Structure: /mf <tool_name_alias> <setting_path> [value]
//
// <tool_name_alias>:
//   - fnr, findreplace -> FindAndReplaceTool
//   - pc, paragraph -> ParagraphControlTool
//   - sm, stylemapper -> StyleMapperTool
//   - sp, smartpunctuation -> SmartPunctuationTool
//   - cf, caseformatter -> CaseFormatterTool
//   - qa, quickaction -> Quick Action Toolbar settings (e.g., 'enabled', 'addpreset')
//   - tac, tagautoclose -> Tag Auto-Close settings (e.g., 'enabled')
//   - general -> General settings like 'enabled', 'autoFormat'
//
// <setting_path>:
//   - A direct property name (e.g., "enabled", "autoFormat", "paragraphControlMode").
//   - For tool-specific settings, it would be a property of that tool's settings object if refactored,
//     or directly on `formatterToolbox.settings` using current structure.
//   - Examples:
//     - "enabled" (master switch for a specific tool if implemented, or for 'general')
//     - "autoFormat" (for 'general')
//     - "paragraphControlMode" (for 'paragraph') -> becomes settings.paragraphControlMode
//     - "positiveReplacement" (for 'smartpunctuation') -> settings.positiveReplacement
//     - "caseFormatterSentenceCase" (for 'caseformatter') -> settings.caseFormatterSentenceCase
//     - For list-based rules (FnR, StyleMapper, QA Presets):
//       - "addrule <find_str> <replace_str> [isRegex] [caseSensitive] [enabled]" (for fnr)
//       - "delrule <index_or_find_str>" (for fnr)
//       - "togglerule <index_or_find_str>" (for fnr)
//
// [value]:
//   - The value to set. Boolean for toggles ('true'/'false', 'on'/'off', '1'/'0').
//   - String for text values. Number for numerical values.
//   - Specific keywords for modes (e.g., 'single', 'max', 'none' for paragraph mode).
//
// Example Command Ideas:
//   - /mf general autoFormat false          (Disable general auto-format)
//   - /mf paragraph paragraphControlMode single (Set paragraph mode to single)
//   - /mf pc paragraphControlMode max         (Alias for paragraph tool)
//   - /mf pc paragraphControlMax 5          (Set max paragraphs to 5)
//   - /mf fnr addrule "teh" "the"           (Add a simple text replacement rule)
//   - /mf fnr addrule "test(\\d)" "Test $1" true (Add a regex rule)
//   - /mf fnr delrule "teh"                 (Delete rule by 'find' string)
//   - /mf fnr togglerule 0                  (Toggle enable state of rule at index 0)
//   - /mf sp positiveReplacement "!!"       (Change smart punctuation positive replacement)
//   - /mf qa addpreset "QuoteIt" "\"" "\""  (Add a QA preset for quotes)
//
// Implementation Sketch:
// 1. Extend current `/formatter` (alias `/mf`) slash command or add a new one.
//    - It might be better to have `/mfset <tool> <path> [value]` to differentiate from `/mf` opening the UI.
// 2. Parser needs to handle variable arguments.
// 3. Callback logic:
//    a. Load formatterToolbox.settings.
//    b. Create a mapping from <tool_name_alias> to actual setting keys or tool objects.
//    c. Based on <tool_name_alias> and <setting_path>:
//       i.  Navigate/identify the target setting property in `formatterToolbox.settings`.
//       ii. For simple properties, validate and coerce `value` to the correct type (boolean, number, string).
//       iii.For list manipulations (addrule, delrule), perform array operations.
//    d. Update `formatterToolbox.settings`.
//    e. Call `formatterToolbox.saveSettings()`.
//    f. Call relevant `formatterToolbox.render<ToolName>Settings()` if UI needs update (e.g. after adding a rule).
//       - Or perhaps a general `formatterToolbox.initializeDynamicContentTypes()` if settings change broadly.
//    g. Provide feedback to user (toastr.success/error).
//
// This requires careful parsing, validation, and mapping to ensure robustness.
// Type coercion for values will be important (e.g., "true" -> true, "0.5" -> 0.5).
*/
