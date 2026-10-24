import { defaultMessageFilter } from '../../core/parser/filter';

describe('MessageFilter Module', () => {
  it('filters out OTP and verification messages', () => {
    const otpMsg = 'Your OTP for transaction of Rs.500 is 123456. Do not share with anyone.';
    const res = defaultMessageFilter.filter(otpMsg);
    expect(res.isTransaction).toBe(false);
    expect(res.dropReason).toBe('otp');
  });

  it('filters out Login and security alerts', () => {
    const loginMsg = 'Your account has been logged in from Chrome at 10:30 AM.';
    const res = defaultMessageFilter.filter(loginMsg);
    expect(res.isTransaction).toBe(false);
    expect(res.dropReason).toBe('login');
  });

  it('filters out pure balance alerts without debits or credits', () => {
    const balMsg = 'Your available balance in A/c XX4567 is Rs.12,345.67';
    const res = defaultMessageFilter.filter(balMsg);
    expect(res.isTransaction).toBe(false);
    expect(res.dropReason).toBe('pure_balance');
  });

  it('filters out promotional spam', () => {
    const promoMsg = 'Congratulations! You have won Rs 500 cashback discount coupon on shopping!';
    const res = defaultMessageFilter.filter(promoMsg);
    expect(res.isTransaction).toBe(false);
    expect(res.dropReason).toBe('promotional');
  });

  it('allows valid transactional messages', () => {
    const valid = 'Rs. 500 debited from A/c XX1234 on 15-May to Swiggy';
    const res = defaultMessageFilter.filter(valid);
    expect(res.isTransaction).toBe(true);
  });

  it('safely handles empty or null input without crashing', () => {
    expect(defaultMessageFilter.filter('').isTransaction).toBe(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(defaultMessageFilter.filter(null as any).isTransaction).toBe(false);
  });

  it('validates transactional senders and rejects personal 10-digit mobile numbers', () => {
    expect(defaultMessageFilter.isTransactionalSender('9876543210')).toBe(false);
    expect(defaultMessageFilter.isTransactionalSender('JD-HDFCBK')).toBe(true);
    expect(defaultMessageFilter.isTransactionalSender('JX-BOBSMS')).toBe(true);
    expect(defaultMessageFilter.isTransactionalSender('com.phonepe.app')).toBe(true);
  });
});
