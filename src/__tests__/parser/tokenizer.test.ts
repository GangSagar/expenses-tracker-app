import { defaultTokenizer } from '../../core/parser/tokenizer';
import { defaultNormalizer } from '../../core/parser/normalizer';

describe('Tokenizer Module', () => {
  it('tokenizes monetary amounts and currency tokens', () => {
    const normalized = defaultNormalizer.normalize('₹ 500.50 DEBIT from A/C XX1234');
    const tokens = defaultTokenizer.tokenize(normalized);

    const currencyToken = tokens.find(t => t.type === 'CURRENCY');
    expect(currencyToken).toBeDefined();
    expect(currencyToken?.value).toBe('₹');

    const amountToken = tokens.find(t => t.type === 'AMOUNT');
    expect(amountToken).toBeDefined();
    expect(amountToken?.normalizedValue).toBe(500.50);
  });

  it('tokenizes UPI VPA handles', () => {
    const normalized = defaultNormalizer.normalize('Transferred to swiggy@icici via UPI');
    const tokens = defaultTokenizer.tokenize(normalized);

    const vpaToken = tokens.find(t => t.type === 'VPA');
    expect(vpaToken).toBeDefined();
    expect(vpaToken?.value).toBe('swiggy@icici');
  });

  it('tokenizes action keywords and payment modes', () => {
    const normalized = defaultNormalizer.normalize('₹ 200 DEBIT via UPI');
    const tokens = defaultTokenizer.tokenize(normalized);

    const keywordToken = tokens.find(t => t.type === 'KEYWORD');
    expect(keywordToken).toBeDefined();
    expect(keywordToken?.normalizedValue).toBe('DEBIT');

    const modeToken = tokens.find(t => t.type === 'PAYMENT_MODE');
    expect(modeToken).toBeDefined();
    expect(modeToken?.normalizedValue).toBe('UPI');
  });

  it('generates concise token string', () => {
    const normalized = defaultNormalizer.normalize('Rs. 500 debited for Amazon via UPI');
    const tokens = defaultTokenizer.tokenize(normalized);
    const tokenStr = defaultTokenizer.toTokenString(tokens);

    expect(tokenStr).toContain('₹500');
    expect(tokenStr).toContain('DEBIT');
    expect(tokenStr).toContain('Amazon');
  });
});
