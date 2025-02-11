// A simple sentiment analyzer: counts a few positive and negative words
function getSentimentScore(text) {
    const positiveWords = ["good", "great", "happy", "awesome", "excellent", "love"];
    const negativeWords = ["bad", "sad", "terrible", "awful", "hate", "poor"];
    let score = 0;
    // Split by whitespace and remove punctuation for basic matching
    const words = text.toLowerCase().split(/\s+/).map(word => word.replace(/[.,!?]/g, ''));
    for (let word of words) {
      if (positiveWords.includes(word)) score += 1;
      if (negativeWords.includes(word)) score -= 1;
    }
    return { compound: score };
  }
  
  // Replicates your Python formatting: narration parts get wrapped in asterisks,
  // and dialogue parts (inside quotes) ending with a comma get punctuation changed based on sentiment.
  function formatText(text) {
    // Replace curly quotes with straight quotes
    text = text.replace(/[“”]/g, '"');
    const parts = text.split('"');
    let formattedText = "";
    
    for (let i = 0; i < parts.length; i++) {
      let part = parts[i].trim();
      if (!part) continue;
      
      // Even-index parts: narration (outside quotes)
      if (i % 2 === 0) {
        if (part) {
          if (!part.startsWith('*')) part = '*' + part;
          if (!part.endsWith('*')) part = part + '*';
          formattedText += part + " ";
        }
      } 
      // Odd-index parts: dialogue (inside quotes)
      else {
        if (part && part.endsWith(',')) {
          const sentiment = getSentimentScore(part);
          if (sentiment.compound > 0.05) {
            part = part.slice(0, -1) + '!';
          } else if (sentiment.compound < -0.05) {
            part = part.slice(0, -1) + '...';
          } else {
            part = part.slice(0, -1) + '.';
          }
        }
        formattedText += '"' + part + '" ';
      }
    }
    
    // Cleanup extra spaces
    formattedText = formattedText.split(/\s+/).join(' ').trim();
    
    // Ensure dialogue remains outside narration markers:
    formattedText = formattedText.replace(/\*"([^"]+)"\*/g, '"$1"');
    formattedText = formattedText.replace(/\*"/g, '* "').replace(/"\*/g, '" *');
    
    // Some environments may not support lookbehind; try/catch for safety.
    try {
      formattedText = formattedText.replace(/(?<!\*)\* \*(?!\*)/g, ' ');
    } catch (e) {
      formattedText = formattedText.replace(/\* \*/g, ' ');
    }
    
    formattedText = formattedText.replace(/\*\*/g, '*').replace(/  /g, ' ').trim();
    return formattedText;
  }
  
  // --- Slash Command Registration ---
  // (This uses SillyTavern's extension API.)
  import { SlashCommandParser, SlashCommand } from "../../../../script.js";
  import { getContext } from "../../extensions.js";
  
  SlashCommandParser.addCommandObject(SlashCommand.fromProps({
    name: 'formatai',
    callback: (namedArgs, unnamedArgs) => {
      const context = getContext();
      let formattedCount = 0;
      
      // Iterate over chat messages – assuming each message object has a "role" property.
      for (let message of context.chat) {
        // Process only AI messages.
        if (message.role && message.role.toLowerCase() === 'assistant') {
          const original = message.content;
          const formatted = formatText(original);
          message.content = formatted;
          formattedCount++;
        }
      }
      
      // (Optional) Trigger a UI update if needed, e.g., context.refreshChat();
      return `Formatted ${formattedCount} AI message(s).`;
    },
    helpString: `
      <div>
        <strong>/formatai</strong> – Formats all AI messages in the conversation.
      </div>
      <div>
        It wraps narration in asterisks and adjusts dialogue punctuation based on sentiment.
      </div>
    `
  }));
  