import { configManager } from './config';

export function detectBank(sender: string, message: string): string | undefined {
  const normalizedSender = (sender || '').toUpperCase();
  const bankRegistry = configManager.getBankRegistry();
  
  // First check sender ID
  for (const bank of bankRegistry) {
    for (const keyword of bank.senderKeywords) {
      if (normalizedSender.includes(keyword.toUpperCase())) {
        return bank.name;
      }
    }
  }

  // Fallback to checking the message body
  const body = (message || '').toUpperCase();
  for (const bank of bankRegistry) {
    for (const keyword of bank.bodyKeywords) {
      // Add space for short 3-letter acronyms to avoid false positives in random words
      const searchStr = keyword.length <= 3 && !keyword.includes('PNB') ? `${keyword} ` : keyword;
      if (body.includes(searchStr)) {
        return bank.name;
      }
    }
  }
  
  return undefined;
}
