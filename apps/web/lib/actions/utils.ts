// Helper function to parse multiple order/task numbers from user message
// Handles: "1 2 3", "1,2,3", "1, 2, 3", "1 and 2", etc.
export function parseMultipleOrderNumbersFromMessage(message: string, maxNumber: number): number[] {
  const numbers: number[] = [];
  const lowerMessage = message.toLowerCase().trim();
  
  // Try to extract all numbers from the message
  // Pattern: matches numbers separated by spaces, commas, "and", etc.
  const numberPatterns = [
    /(\d+)/g, // Simple: just extract all numbers
  ];
  
  for (const pattern of numberPatterns) {
    const matches = lowerMessage.matchAll(pattern);
    for (const match of matches) {
      const num = parseInt(match[1]);
      if (num > 0 && num <= maxNumber && !numbers.includes(num)) {
        numbers.push(num);
      }
    }
  }
  
  // Also check for ordinal words
  const ordinalWords: Record<string, number> = {
    'first': 1, '1st': 1,
    'second': 2, '2nd': 2,
    'third': 3, '3rd': 3,
    'fourth': 4, '4th': 4,
    'fifth': 5, '5th': 5,
    'sixth': 6, '6th': 6,
    'seventh': 7, '7th': 7,
    'eighth': 8, '8th': 8,
    'ninth': 9, '9th': 9,
    'tenth': 10, '10th': 10
  };
  
  for (const [word, num] of Object.entries(ordinalWords)) {
    const wordRegex = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (wordRegex.test(lowerMessage) && num <= maxNumber && !numbers.includes(num)) {
      numbers.push(num);
    }
  }
  
  return numbers.sort((a, b) => a - b); // Return sorted unique numbers
}

// Helper function to parse order/task number from user message (single number)
// Handles: "3rd order", "first order", "order 2", "2", "third", etc.
export function parseOrderNumberFromMessage(message: string, maxNumber: number): number | null {
  const lowerMessage = message.toLowerCase();
  
  // Map of ordinal words to numbers (use word boundaries to avoid false matches)
  const ordinalWords: Record<string, number> = {
    'first': 1, '1st': 1,
    'second': 2, '2nd': 2,
    'third': 3, '3rd': 3,
    'fourth': 4, '4th': 4,
    'fifth': 5, '5th': 5,
    'sixth': 6, '6th': 6,
    'seventh': 7, '7th': 7,
    'eighth': 8, '8th': 8,
    'ninth': 9, '9th': 9,
    'tenth': 10, '10th': 10
  };
  
  // Try to find ordinal words with word boundaries
  for (const [word, num] of Object.entries(ordinalWords)) {
    const wordRegex = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (wordRegex.test(lowerMessage) && num <= maxNumber) {
      return num;
    }
  }
  
  // Try to find numeric patterns
  const numericPatterns = [
    /(?:order|task|item|number)\s+(\d+)/i,
    /(\d+)(?:st|nd|rd|th)?\s+(?:order|task|item)/i,
    /\b(\d+)(?:st|nd|rd|th)\b/i,
    /^(\d+)$/,
    /\b(\d+)\b/
  ];
  
  for (const pattern of numericPatterns) {
    const match = lowerMessage.match(pattern);
    if (match && match[1]) {
      const num = parseInt(match[1]);
      if (num > 0 && num <= maxNumber) {
        return num;
      }
    }
  }
  
  return null;
}

// Helper function to parse order mappings from message body
export function parseOrderMappingsFromMessage(messageBody: string): Record<string, string> {
  const mappings: Record<string, string> = {};
  
  // Pattern 1: "1. Order ORD-123: product x1" or "1. Order ORD-123-abc: product x1"
  // This matches order IDs that start with ORD- followed by alphanumeric and hyphens
  const orderPattern1 = /(\d+)\.\s*Order\s+([A-Z0-9-]+):/gi;
  let match;
  
  while ((match = orderPattern1.exec(messageBody)) !== null) {
    const prefixNumber = match[1];
    const orderId = match[2];
    // Only add if it looks like an order ID (starts with ORD- or is alphanumeric with hyphens)
    if (orderId.startsWith('ORD-') || /^[A-Z0-9-]+$/.test(orderId)) {
      mappings[prefixNumber] = orderId;
    }
  }
  
  // Pattern 2: "1. Order today evening 6pm: product x1" (no order ID in format)
  // For these, we can't extract the order ID from the message, but the context
  // should have the mappings stored from when the list was created
  
  return mappings;
}

