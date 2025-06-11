# Formatter Toolbox for SillyTavern

**Formatter Toolbox** is a powerful, modular, and customizable extension for SillyTavern designed to automatically enhance and standardize the formatting of AI-generated messages. It also provides manual tools for quick text manipulations.

## Core Principles

*   **Customization:** Configure a wide array of settings and rules to tailor the formatting to your exact preferences.
*   **Modularity:** Formatting is applied through a pipeline of distinct tools, each with a specific purpose. You can control the order in which these tools operate.
*   **Automation & Precision:** Apply formatting automatically to new messages or selectively using commands. Tools like Style Mapper allow for semantic understanding of text for precise targeting of other formatting tools.

## Main Interface: The Formatter Toolbox

Access the main interface using the slash command:

*   `/formatter` (or its alias `/mf`)

This opens a comprehensive, tabbed modal window where you can configure all aspects of the extension.

## Automatic Formatting Pipeline

The heart of the Formatter Toolbox is its automatic formatting pipeline. You can define the order in which these tools process AI messages. Each tool has its own configuration tab in the toolbox.

1.  **Find & Replace:**
    *   **Purpose:** Performs initial, raw text cleanup. It's perfect for fixing common AI typos (e.g., `i` -> `I`), removing unwanted artifacts (e.g., extra spaces before punctuation), or making consistent word choice substitutions (`gonna` -> `going to`).
    *   **Features:** A user-managed list of replacement rules. Each rule can be a simple text-to-text replacement or a powerful Regular Expression (Regex). Rules can be individually enabled, disabled, edited, and deleted.

2.  **Paragraph Control:**
    *   **Purpose:** Enforces a consistent paragraph structure in the AI's response.
    *   **Features:**
        *   **Force Single Paragraph:** Collapses the entire response into one paragraph.
        *   **Allow Maximum:** Ensures the response does not exceed a user-defined number of paragraphs.
        *   **Ensure Minimum:** Normalizes paragraph breaks (currently does not add paragraphs if below the minimum).

3.  **Style Mapper:**
    *   **Purpose:** The core of semantic detection. This tool finds text patterns and wraps them in invisible tags (e.g., `__TAG_START_dialogue__...__TAG_END_dialogue__`), telling other tools "this part is dialogue" or "this part is a thought." It doesn't change the visual style itself but prepares the text for other tools.
    *   **Features:** A user-managed list of style rules based on Regex. Allows the user to define what patterns constitute different elements (e.g., text in asterisks as 'thought', text in quotes as 'dialogue').

4.  **Smart Punctuation:**
    *   **Purpose:** Intelligently formats punctuation, acting upon the tags created by the Style Mapper.
    *   **Features:** Targets a specific element (e.g., only text tagged as 'dialogue'). Finds a target punctuation mark (e.g., a comma `,`) at the end of a line within the targeted tag. Replaces it with different punctuation based on a basic sentiment analysis of the text (`!`, `...`, `.`, etc.). All replacement characters and sentiment thresholds are user-configurable.

5.  **Case Formatter:**
    *   **Purpose:** A final polishing tool to ensure consistent capitalization after all other text manipulations have occurred.
    *   **Features:**
        *   **Sentence case:** Automatically capitalizes the first letter of every sentence, fixing common AI errors where a new sentence starts with a lowercase letter. It correctly handles text segments interspersed with Style Mapper tags.

**Configurable Tool Order:** The sequence in which these automatic tools are applied to messages can be easily reordered via drag-and-drop in the "General & Order" tab of the toolbox.

## Manual Interaction Tools

These tools provide on-the-fly text manipulation capabilities.

1.  **Quick-Action Toolbar:**
    *   **Purpose:** A floating toolbar that appears when you select text in chat messages or input areas, providing rapid formatting actions.
    *   **Toggle:** Can be enabled/disabled in the "Quick Actions" tab of the Formatter Toolbox.
    *   **Actions:**
        *   **Standard Wraps:** Quickly wrap selected text in `*asterisks*`, `_underscores_`, or `"quotes"`.
        *   **Custom Wrap Presets:** Buttons for user-defined wrapper pairs (e.g., `(...)`, `[...]`) configured in the toolbox.
        *   **Custom... Prompt:** Prompts for arbitrary start and end wrappers.
        *   **Remove Wrappers:** Intelligently removes common surrounding wrapper pairs from the selection.
        *   **Delete:** Deletes the selected text.
        *   **Case Change:** Convert selection to Sentence case, lowercase, or UPPERCASE.
        *   **Undo QA:** A single-level undo for the last Quick Action performed.

2.  **Tag Auto-Close:**
    *   **Purpose:** A smart assistant to help fix broken XML-style markup (e.g., unclosed `<think>` tags) often generated by AI.
    *   **Toggle:** Can be enabled/disabled in the "Tag Auto-Close" tab of the Formatter Toolbox.
    *   **Functionality:** When typing or clicking in the main chat input area (`#send_textarea`), the tool scans the text before the cursor for an unclosed XML-style tag. If found, a small, non-intrusive popup appears (e.g., "Insert `</think>` here?"). Clicking the popup inserts the correct closing tag.

## Commands & Control

The Formatter Toolbox offers several slash commands for control:

*   `/formatter` (or `/mf`): Opens the main Formatter Toolbox settings panel.
*   `/format`: Applies the active automatic formatting pipeline to the **visible swipe** of all AI messages in the current chat.
*   `/formatall`: Applies the active automatic formatting pipeline to **ALL swipes** (visible and hidden) of all AI messages in the current chat.
*   `/formatlast`: Applies the active automatic formatting pipeline to the **visible swipe** of only the **last** AI message in the current chat.
*   `/undoformat`: Reverts the last formatting operation applied by `/format` or `/formatlast` to the visible swipes of all AI messages.
*   `/undoformatall`: Reverts the last formatting operation applied by `/formatall` to ALL swipes of all AI messages.
*   `/undoformatlast`: Reverts the last formatting operation applied to the last AI message.

**Future Development:**
*   **Command-Line Settings:** Plans include enhancing the `/mf` command to allow direct manipulation of tool settings (e.g., `/mf paragraph mode single`).

---
Formatter Toolbox aims to provide a seamless and powerful way to achieve your desired message appearance. Enjoy!
