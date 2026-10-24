export type TokenType =
  | 'CURRENCY'
  | 'AMOUNT'
  | 'KEYWORD'
  | 'ACCOUNT'
  | 'VPA'
  | 'REFERENCE'
  | 'BALANCE'
  | 'PAYMENT_MODE'
  | 'DATE'
  | 'WORD'
  | 'PUNCTUATION';

export interface Token {
  type: TokenType;
  value: string;
  normalizedValue?: string | number;
  startIndex: number;
  endIndex: number;
}
