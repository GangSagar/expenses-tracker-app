import { generateBudgetInsights } from '../services/advisorService';
import { Expense } from '../types/expense';

describe('Local Smart Budget Advisor Engine', () => {
  const mockExpenses: Expense[] = [
    {
      id: 1,
      amount: 1500,
      merchant: 'Swiggy',
      category: 'Food & Dining',
      timestamp: Date.now() - 1000 * 60 * 60, // 1 hour ago
      source: 'sms',
      transactionType: 'debit',
      isInvalid: false,
      confidence: 1,
      rawMessage: '',
    },
    {
      id: 2,
      amount: 4500,
      merchant: 'Amazon',
      category: 'Shopping',
      timestamp: Date.now() - 1000 * 60 * 60 * 2, // 2 hours ago
      source: 'manual',
      transactionType: 'debit',
      isInvalid: false,
      confidence: 1,
      rawMessage: '',
    },
    {
      id: 3,
      amount: 1000,
      merchant: 'Uber',
      category: 'Travel',
      timestamp: Date.now() - 1000 * 60 * 60 * 24, // 24 hours ago
      source: 'sms',
      transactionType: 'debit',
      isInvalid: false,
      confidence: 1,
      rawMessage: '',
    },
  ];

  it('prompts the user to configure a budget limit if zero or invalid', () => {
    const result = generateBudgetInsights(mockExpenses, 0);
    expect(result.headline).toContain('Set a Budget Limit');
    expect(result.status).toBe('good');
  });

  it('reports perfect budget status if zero expenditures are registered', () => {
    const result = generateBudgetInsights([], 15000);
    expect(result.headline).toContain('Perfect Ledger State');
    expect(result.status).toBe('good');
  });

  it('projections are within boundaries for healthy expenditures', () => {
    // Large budget limit of ₹500,000 should trigger a highly safe ON TRACK status
    const result = generateBudgetInsights(mockExpenses, 500000);
    expect(result.status).toBe('good');
    expect(result.headline).toContain('Excellent');
    expect(result.savingsEstimate).toBeGreaterThan(0);
  });

  it('triggers runaway trajectory danger alerts if budget limit is small', () => {
    // Tiny budget limit of ₹2,000 will instantly trigger budget cap exceeded alerts
    const result = generateBudgetInsights(mockExpenses, 2000);
    expect(result.status).toBe('danger');
    expect(result.headline).toContain('Budget Cap Exceeded');
  });

  it('appends highly premium, category-specific micro-advices', () => {
    // Shopping accounts for ₹4,500 of ₹7,000 spent (64%)
    const result = generateBudgetInsights(mockExpenses, 500000);
    expect(result.message).toContain('Shopping is your largest expense');
    expect(result.message).toContain('waiting 48 hours');
  });
});
