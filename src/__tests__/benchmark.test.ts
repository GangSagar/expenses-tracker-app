import { parseMessage, parseStructured } from '../core/parser/parseMessage';

describe('Parser Throughput Benchmark', () => {
  const sampleMessages = [
    {
      msg: 'Dear Customer, your A/c XX1234 is debited for Rs 450.00 on 18-Oct-26 at SWIGGY - HDFC Bank',
      sender: 'HDFCBK',
    },
    {
      msg: 'Your A/C X5678 debited by Rs.1,250.00 on 12-May-2026 14:30:15 transfer to Zomato UPI Ref 412345678901 - SBI',
      sender: 'SBIINB',
    },
    {
      msg: 'Acct XX9012 debited with INR 85.50 on 05-Jun-26. Info: UPI/uber/paytm. Bal: INR 12,450.00',
      sender: 'ICICIB',
    },
    {
      msg: 'Rs 549.00 spent on Axis Bank Card ending 4321 at FLIPKART on 20-Jul-26. Avl Lmt: Rs 45,000.00',
      sender: 'AXISBK',
    },
    {
      msg: 'KOTAK BANK: Rs 300 debited from a/c ...7890 towards AMAZON PAY on 10-Aug-26. Ref: 654321987012',
      sender: 'KOTAKB',
    },
  ];

  it('measures throughput for 1,000 messages', () => {
    const COUNT = 1000;
    const start = performance.now();

    for (let i = 0; i < COUNT; i++) {
      const sample = sampleMessages[i % sampleMessages.length];
      parseMessage(sample.msg, sample.sender, 'sms');
    }

    const elapsedMs = performance.now() - start;
    const msPerMessage = elapsedMs / COUNT;
    const msgPerSec = Math.round((COUNT / elapsedMs) * 1000);

    console.log(`\n============================================================`);
    console.log(`⚡ PARSER THROUGHPUT BENCHMARK (1,000 MESSAGES)`);
    console.log(`============================================================`);
    console.log(`Total Elapsed:        ${elapsedMs.toFixed(2)} ms`);
    console.log(`Average Per Message:  ${msPerMessage.toFixed(3)} ms (${(msPerMessage * 1000).toFixed(1)} µs)`);
    console.log(`Throughput:           ${msgPerSec.toLocaleString()} messages / second`);
    console.log(`Estimated 10,000 SMS: ${(10000 * msPerMessage / 1000).toFixed(2)} seconds`);
    console.log(`============================================================\n`);

    expect(msPerMessage).toBeLessThan(1.0); // Should be well under 1ms per message
  });

  it('measures throughput for parseStructured', () => {
    const COUNT = 1000;
    const start = performance.now();

    for (let i = 0; i < COUNT; i++) {
      const sample = sampleMessages[i % sampleMessages.length];
      parseStructured(sample.msg, sample.sender, 'sms');
    }

    const elapsedMs = performance.now() - start;
    const msPerMessage = elapsedMs / COUNT;
    const msgPerSec = Math.round((COUNT / elapsedMs) * 1000);

    console.log(`\n============================================================`);
    console.log(`⚡ PARSE_STRUCTURED THROUGHPUT BENCHMARK (1,000 MESSAGES)`);
    console.log(`============================================================`);
    console.log(`Total Elapsed:        ${elapsedMs.toFixed(2)} ms`);
    console.log(`Average Per Message:  ${msPerMessage.toFixed(3)} ms`);
    console.log(`Throughput:           ${msgPerSec.toLocaleString()} messages / second`);
    console.log(`============================================================\n`);

    expect(msPerMessage).toBeLessThan(1.0);
  });
});
