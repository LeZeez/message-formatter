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
                { find: "(\\s+)([.,?!])", replaceWith: "$2", isRegex: true, caseSensitive: false, enabled: true },
                { find: "gonna", replaceWith: "going to", isRegex: false, caseSensitive: false, enabled: true },
                { find: "testcase", replaceWith: "TestCase", isRegex: false, caseSensitive: true, enabled: true },
                { find: "Testcase", replaceWith: "SHOULD NOT REPLACE", isRegex: false, caseSensitive: true, enabled: true }
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
            tagAutoCloseEnabled: false // Added this default
        };
        this.tools.push(new FindAndReplaceTool());
        this.tools.push(new ParagraphControlTool());
        this.tools.push(new StyleMapperTool());
        this.tools.push(new SmartPunctuationTool());
        this.tools.push(new CaseFormatterTool());
    }

    loadSettings() {
        extension_settings[extensionName] = extension_settings[extensionName] || {};
        if (Object.keys(extension_settings[extensionName]).length === 0) {
            Object.assign(extension_settings[extensionName], this.defaultSettings);
        }
        this.settings = extension_settings[extensionName];
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
            this.renderQuickActionSettings();
            $('#qa-toolbar-enabled').off('change').on('change', () => this.updateQuickActionSettings());
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
    renderFindAndReplaceRules() { /* ... (already implemented) ... */
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
    renderParagraphControlSettings() { /* ... (already implemented) ... */
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
    renderStyleMapperRules() { /* ... (already implemented) ... */
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
    renderSmartPunctuationSettings() { /* ... (already implemented) ... */
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
    renderCaseFormatterSettings() { /* ... (already implemented) ... */
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
    renderQuickActionSettings() { /* ... (already implemented) ... */
        if (!$('#qa-toolbar-enabled').length) return;
        const s = this.settings;
        if (s.quickActionToolbarEnabled === undefined) s.quickActionToolbarEnabled = false;
        $('#qa-toolbar-enabled').prop('checked', s.quickActionToolbarEnabled);
    }
    updateQuickActionSettings() { /* ... (already implemented) ... */
        if (!$('#qa-toolbar-enabled').length) return;
        this.settings.quickActionToolbarEnabled = $('#qa-toolbar-enabled').is(':checked');
        this.saveSettings();
        if (this.settings.quickActionToolbarEnabled) {
            this.injectToolbarHTML(); this.initializeTextSelectionListener();
        } else { this.removeTextSelectionListener(); }
    }
    injectToolbarHTML() { /* ... (already implemented) ... */
        if ($('#quick-action-toolbar').length === 0) {
            const html = `<div id="quick-action-toolbar" style="display: none; position: absolute; background-color: #fff; border: 1px solid #ccc; border-radius: 4px; padding: 5px; box-shadow: 2px 2px 5px rgba(0,0,0,0.2); z-index: 1005; flex-wrap: wrap; gap: 3px;"><button data-action="wrap-asterisk" title="Wrap in *">*Wrap*</button><button data-action="wrap-underscore" title="Wrap in _">_Wrap_</button><button data-action="wrap-quotes" title="Wrap in &quot;">"Wrap"</button><button data-action="wrap-custom" title="Custom Wrap">Custom...</button><button data-action="remove-wrappers" title="Remove Wrappers">Rm Wraps</button><button data-action="delete-selection" style="color: red;" title="Delete Selection">Delete</button><select data-action="case-change" title="Change Case"><option value="">Case...</option><option value="sentence">Sentence</option><option value="lower">lowercase</option><option value="upper">UPPERCASE</option></select></div>`;
            $('body').append(html); this.bindToolbarActions();
        }
    }
    bindToolbarActions() { /* ... (already implemented) ... */
        const toolbar = $('#quick-action-toolbar'); if (!toolbar.length) { this.injectToolbarHTML(); }
        toolbar.off('click.qaActions').on('click.qaActions', 'button[data-action]', (e) => { const a = $(e.currentTarget).data('action'); this.handleQuickAction(a); e.stopPropagation(); });
        toolbar.off('change.qaActions').on('change.qaActions', 'select[data-action="case-change"]', (e) => { const act = $(e.currentTarget).data('action'); const val = $(e.currentTarget).val(); if (val) { this.handleQuickAction(act, val); } e.stopPropagation(); $(e.currentTarget).val(""); });
    }
    handleQuickAction(action, value = null) { /* ... (already implemented) ... */
        const toolbar = $('#quick-action-toolbar'); const details = toolbar.data('selectionDetails');
        if (!details || !details.selection || !details.selection.rangeCount) { toolbar.hide(); return; }
        const selection = details.selection; const range = selection.getRangeAt(0); const selectedText = selection.toString();
        let newText = selectedText; let replaced = false;
        switch (action) {
            case 'wrap-asterisk': newText = `*${selectedText}*`; replaced = true; break;
            case 'wrap-underscore': newText = `_${selectedText}_`; replaced = true; break;
            case 'wrap-quotes': newText = `"${selectedText}"`; replaced = true; break;
            case 'wrap-custom': const cw = prompt("Wrappers (e.g., <,>)", details.lastCustomWrap || ""); if (cw) { details.lastCustomWrap = cw; toolbar.data('selectionDetails', details); const [s, e] = cw.split(','); if (s!==undefined&&e!==undefined) {newText=`${s.trim()}${selectedText}${e.trim()}`; replaced=true;} } break;
            case 'remove-wrappers': if (selectedText.length >= 2) { const f=selectedText[0]; const l=selectedText[selectedText.length-1]; if ((f==='*'&&l==='*')||(f==='_'&&l==='_')||(f==='"'&&l==='"')||(f==='('&&l===')')||(f==='['&&l===']')||(f==='{'&&l==='}')) {newText=selectedText.slice(1,-1); replaced=true;} } break;
            case 'delete-selection': newText = ''; replaced = true; break;
            case 'case-change': if (value==='sentence') newText=this._toSentenceCaseHelper(selectedText); else if (value==='lower') newText=selectedText.toLowerCase(); else if (value==='upper') newText=selectedText.toUpperCase(); replaced=true; break;
        }
        if (replaced) { range.deleteContents(); range.insertNode(document.createTextNode(newText)); console.log("QA applied. Robust saving TODO."); selection.removeAllRanges(); toolbar.hide(); toolbar.removeData('selectionDetails');}
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
            if (!tb.length) { this.injectToolbarHTML(); tb = $('#quick-action-toolbar');}
            const $target = $(e.target); const $msgEl = $target.closest('.mes_text, #send_textarea, #char_edit_textarea, #note_text_area');
            if (txt && $msgEl.length > 0 && !$target.closest('#quick-action-toolbar').length) {
                tb.css({top: e.pageY + 10 + 'px', left: Math.min(e.pageX, window.innerWidth - tb.outerWidth() - 10) + 'px', display: 'flex'})
                  .data('selectionDetails', { selection: sel, messageElement: $msgEl[0], lastCustomWrap: tb.data('selectionDetails')?.lastCustomWrap || ""});
            } else if (!$target.closest('#quick-action-toolbar').length) { tb.hide().removeData('selectionDetails'); }
        });
        $(document).off('mousedown.qaToolbarHide').on('mousedown.qaToolbarHide', (e) => { const tb = $('#quick-action-toolbar'); if (tb.is(':visible') && !$(e.target).closest('#quick-action-toolbar').length && window.getSelection().isCollapsed) { tb.hide().removeData('selectionDetails');}});
        $(window).off('scroll.qaToolbarHide').on('scroll.qaToolbarHide', () => { const tb = $('#quick-action-toolbar'); if (tb.is(':visible')) { tb.hide().removeData('selectionDetails');}});
    }
    removeTextSelectionListener() { /* ... (already implemented) ... */
        $(document).off('mouseup.qaToolbar mousedown.qaToolbarHide'); $(window).off('scroll.qaToolbarHide');
        $('#quick-action-toolbar').hide().removeData('selectionDetails');
    }

    // Tag Auto-Close Methods
    renderTagAutoCloseSettings() {
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
            const charJustBeforeCursor = textBeforeCursor.charAt(cursorPos - 1);
            const charTwoBeforeCursor = textBeforeCursor.charAt(cursorPos - 2);
            const lastOpenTagFull = `<${lastUnclosedTag}>`;
            if (textBeforeCursor.endsWith(lastOpenTagFull) && cursorPos === textBeforeCursor.length) {
                 this.hideTagAutoClosePopup(); return;
            }
            if (charJustBeforeCursor === '"' && charTwoBeforeCursor === '=') {
                this.hideTagAutoClosePopup(); return;
            }
            if (/[a-zA-Z0-9_:-]/.test(charJustBeforeCursor) && textBeforeCursor.lastIndexOf('<') > textBeforeCursor.lastIndexOf('>')) {
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
    onMessageUpdate(msgIndex) { /* ... (no changes needed) ... */
        const context = getContext();
        if (msgIndex >= context.chat.length || msgIndex < 0) return;
        const message = context.chat[msgIndex];
        if (!this.settings.enabled || !message || message.is_user) { return; }
        if (message.extra && message.extra.pre_format_mes !== undefined) {
            message.extra.pre_format_mes = message.mes;
            message.extra.pre_format_swipes = message.swipes ? [...message.swipes] : undefined;
            coreSaveChatDebounced();
        }
        if (!this.settings.autoFormat) {
            if (this.formatMessage(message, false)) {
                const messageElement = document.querySelector(`.mes[mesid="${msgIndex}"] .mes_text`);
                if (messageElement) { messageElement.innerHTML = coreMessageFormatting(message.mes, message.name, message.is_system, message.is_user, msgIndex); }
                coreSaveChatDebounced();
            }
        }
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
            #formatterToolboxModal { display: none; position: fixed; z-index: 1001; left: 0; top: 0; width: 100%; height: 100%; overflow: auto; background-color: rgba(0,0,0,0.4); }
            #formatterToolboxModal .modal-content { background-color: #fefefe; margin: 10% auto; padding: 20px; border: 1px solid #888; width: 80%; max-width: 700px; border-radius: 5px; position: relative; }
            #formatterToolboxModal .close-button { color: #aaa; float: right; font-size: 28px; font-weight: bold; }
            #formatterToolboxModal .close-button:hover, #formatterToolboxModal .close-button:focus { color: black; text-decoration: none; cursor: pointer; }
            .formatter-tabs { border-bottom: 1px solid #ccc; padding-bottom: 5px; margin-bottom: 10px; display: flex; flex-wrap: wrap;}
            .formatter-tabs button { background-color: #f1f1f1; border: 1px solid #ccc; padding: 8px 12px; cursor: pointer; margin-right: 2px; border-radius: 3px 3px 0 0; margin-bottom: -1px; }
            .formatter-tabs button.active { background-color: #ddd; border-bottom: 1px solid #ddd; }
            .tab-content { display: none; padding: 15px; border: 1px solid #ccc; border-top: none; animation: fadeIn 0.5s; }
            .tab-content.active { display: block; }
            @keyframes fadeIn { from {opacity: 0;} to {opacity: 1;} }
            .formatter-rule-item { display: flex; align-items: center; gap: 8px; padding: 8px; border-bottom: 1px solid #f0f0f0; flex-wrap: wrap; }
            .formatter-rule-item:last-child { border-bottom: none; }
            .formatter-rule-item input[type="text"] { flex-basis: 200px; flex-grow: 1; padding: 5px; margin-bottom: 5px;}
            .formatter-rule-item label { margin-bottom: 5px; display: flex; align-items: center; white-space: nowrap; }
            .formatter-rule-item input[type="checkbox"] { margin-right: 3px;}
            #sm-rules-container, #fnr-rules-container { margin-bottom: 10px; max-height: 300px; overflow-y: auto; border: 1px solid #eee; padding: 5px;}
            #tool-order-list { border: 1px solid #ccc; padding: 10px; border-radius: 3px; background-color: #f9f9f9; min-height:50px; }
            .tool-order-item { padding: 8px 12px; background-color: #fff; border: 1px solid #ddd; margin-bottom: 5px; border-radius: 3px; cursor: grab; user-select: none;}
            .tool-order-item:last-child { margin-bottom: 0; }
            .tool-order-item.dragging { opacity: 0.5; background: #e0e0e0; }
            .formatter-button { background-color: #e0e0e0; border: 1px solid #ccc; padding: 5px 10px; cursor: pointer; border-radius: 3px; margin-top: 5px; }
            .formatter-button.delete { background-color: #ffdddd; border-color: #ffaaaa; margin-left: auto; }
            .formatter-button:hover { background-color: #d0d0d0; }
            .formatter-button.delete:hover { background-color: #ffcccc; }
            .formatter-setting-item { display: flex; align-items: center; margin-bottom: 10px; gap: 10px; }
            .formatter-setting-item label { min-width: 150px; font-size: 0.9em; }
            .formatter-setting-item select, .formatter-setting-item input[type="number"], .formatter-setting-item input[type="text"] { padding: 5px; border-radius: 3px; border: 1px solid #ccc; font-size: 0.9em; flex-grow: 1; }
            #quick-action-toolbar button, #quick-action-toolbar select { margin: 2px; padding: 5px 8px; border: 1px solid #ddd; background-color: #f0f0f0; cursor: pointer; border-radius: 3px; }
            #quick-action-toolbar button:hover, #quick-action-toolbar select:hover { background-color: #e0e0e0; }
            #tag-autoclose-popup { background-color: #f0f0f0; border: 1px solid #c5c5c5; padding: 6px 10px; border-radius: 3px; box-shadow: 1px 1px 4px rgba(0,0,0,0.15); z-index: 1006; cursor: pointer; font-size: 0.9em;}
            #tag-autoclose-popup code { background-color: #e0e0e0; padding: 1px 3px; border-radius: 2px; }
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
