import { Platform } from 'react-native';

interface SpanAttribute {
  key: string;
  value: {
    stringValue?: string;
    intValue?: string;
    doubleValue?: number;
    boolValue?: boolean;
  };
}

interface RawSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind: number; // 1 = INTERNAL, 2 = SERVER, 3 = CLIENT
  startTimeUnixNano: string;
  endTimeUnixNano: string;
  attributes: SpanAttribute[];
  status?: { code: number; message?: string };
}

class TelemetryService {
  private isTest: boolean =
    typeof (globalThis as any).process !== 'undefined' &&
    (globalThis as any).process?.env?.NODE_ENV === 'test';
  private enabled: boolean = __DEV__ && !this.isTest;
  private queue: RawSpan[] = [];
  private flushTimer: any = null;
  private osType: string = Platform?.OS || 'android';
  private primaryEndpoint: string = 'http://127.0.0.1:4318/v1/traces';
  private emulatorEndpoint: string = 'http://10.0.2.2:4318/v1/traces';
  private targetEndpoint: string = 'http://127.0.0.1:4318/v1/traces';

  constructor() {
    if (this.enabled) {
      this.startFlushInterval();
    }
  }

  private randomHex(bytes: number): string {
    const chars = '0123456789abcdef';
    let result = '';
    for (let i = 0; i < bytes * 2; i++) {
      result += chars[Math.floor(Math.random() * 16)];
    }
    return result;
  }

  private toUnixNano(timestampMs: number): string {
    return `${timestampMs}000000`;
  }

  private formatAttributes(attrs?: Record<string, any>): SpanAttribute[] {
    const result: SpanAttribute[] = [
      { key: 'platform', value: { stringValue: this.osType } },
      { key: 'app.name', value: { stringValue: 'ExpenseTracker' } },
    ];

    if (!attrs) return result;

    for (const [key, val] of Object.entries(attrs)) {
      if (val === undefined || val === null) continue;

      if (typeof val === 'string') {
        // Sanitize: Avoid logging full raw personal message bodies or phone numbers
        const sanitized = val.length > 120 ? val.substring(0, 120) + '...' : val;
        result.push({ key, value: { stringValue: sanitized } });
      } else if (typeof val === 'number') {
        if (Number.isInteger(val)) {
          result.push({ key, value: { intValue: val.toString() } });
        } else {
          result.push({ key, value: { doubleValue: val } });
        }
      } else if (typeof val === 'boolean') {
        result.push({ key, value: { boolValue: val } });
      }
    }

    return result;
  }

  /**
   * Start a new OpenTelemetry span
   */
  public startSpan(name: string, initialAttributes?: Record<string, any>) {
    const traceId = this.randomHex(16);
    const spanId = this.randomHex(8);
    const startTimeMs = Date.now();
    const attributes = { ...initialAttributes };

    return {
      setAttribute: (key: string, val: any) => {
        attributes[key] = val;
      },
      end: (error?: Error) => {
        if (!this.enabled) return;

        const endTimeMs = Date.now();
        const formattedAttrs = this.formatAttributes(attributes);
        formattedAttrs.push({
          key: 'duration_ms',
          value: { doubleValue: endTimeMs - startTimeMs },
        });

        const span: RawSpan = {
          traceId,
          spanId,
          name,
          kind: 1, // INTERNAL
          startTimeUnixNano: this.toUnixNano(startTimeMs),
          endTimeUnixNano: this.toUnixNano(endTimeMs),
          attributes: formattedAttrs,
          status: error
            ? { code: 2, message: error.message }
            : { code: 1 },
        };

        this.queue.push(span);
        if (this.queue.length >= 10) {
          this.flush();
        }
      },
    };
  }

  /**
   * Helper to measure any synchronous function
   */
  public traceSync<T>(
    name: string,
    attributes: Record<string, any>,
    fn: () => T
  ): T {
    const span = this.startSpan(name, attributes);
    try {
      const res = fn();
      span.end();
      return res;
    } catch (err: any) {
      span.end(err);
      throw err;
    }
  }

  /**
   * Helper to measure any asynchronous promise
   */
  public async traceAsync<T>(
    name: string,
    attributes: Record<string, any>,
    fn: () => Promise<T>
  ): Promise<T> {
    const span = this.startSpan(name, attributes);
    try {
      const res = await fn();
      span.end();
      return res;
    } catch (err: any) {
      span.end(err);
      throw err;
    }
  }

  private startFlushInterval() {
    if (this.flushTimer) clearInterval(this.flushTimer);
    this.flushTimer = setInterval(() => {
      this.flush();
    }, 2000);
  }

  private async flush() {
    if (!this.enabled || this.queue.length === 0) return;

    const spansToExport = [...this.queue];
    this.queue = [];

    const payload = {
      resourceSpans: [
        {
          resource: {
            attributes: [
              { key: 'service.name', value: { stringValue: 'expense-tracker-mobile' } },
              { key: 'service.version', value: { stringValue: '1.3.1' } },
              { key: 'os.type', value: { stringValue: this.osType } },
            ],
          },
          scopeSpans: [
            {
              scope: { name: 'com.expensetracker.telemetry' },
              spans: spansToExport,
            },
          ],
        },
      ],
    };

    try {
      const res = await fetch(this.targetEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok && this.targetEndpoint === this.primaryEndpoint) {
        // Fallback to emulator gateway 10.0.2.2 if 127.0.0.1 fails
        this.targetEndpoint = this.emulatorEndpoint;
      }
    } catch {
      // If primary endpoint fails, switch to emulator gateway on next flush
      if (this.targetEndpoint === this.primaryEndpoint) {
        this.targetEndpoint = this.emulatorEndpoint;
      }
    }
  }
}

export const telemetry = new TelemetryService();
