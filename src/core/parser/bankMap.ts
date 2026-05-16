import { KNOWN_BANKS } from '../../constants/appOptions';

export function detectBank(sender: string, message: string): string | undefined {
  const normalizedSender = sender.toUpperCase();
  
  // First check sender ID
  for (const bank of KNOWN_BANKS) {
    for (const keyword of bank.keywords) {
      if (normalizedSender.includes(keyword)) {
        return bank.name;
      }
    }
  }

  // Fallback to checking the message body
  const body = message.toUpperCase();
  for (const bank of KNOWN_BANKS) {
    for (const keyword of bank.keywords) {
      // Add space for short 3-letter acronyms to avoid false positives in random words
      const searchStr = keyword.length <= 3 && !keyword.includes('PNB') ? `${keyword} ` : keyword;
      if (body.includes(searchStr)) {
        return bank.name;
      }
    }
  }
  
  return undefined;
}
