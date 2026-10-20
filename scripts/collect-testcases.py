#!/usr/bin/env python3
import subprocess
import sqlite3
import json
import os
import sys

def main():
    print("\n🔍 Checking for connected Android devices via ADB...")
    devices_output = subprocess.run(["adb", "devices"], capture_output=True, text=True)
    lines = [line.strip() for line in devices_output.stdout.splitlines() if line.strip() and not line.startswith("List of devices")]
    
    devices = [line.split()[0] for line in lines if "device" in line]
    if not devices:
        print("❌ No active Android devices found. Make sure your phone is connected and USB Debugging is allowed.")
        sys.exit(1)

    device_id = devices[0]
    print(f"✔ Found device: {device_id}")

    tmp_db_path = "/tmp/phone_expense_tracker.db"
    if os.path.exists(tmp_db_path):
        os.remove(tmp_db_path)

    print("📥 Extracting database from device (com.expensetracker)...")
    pull_cmd = f"adb -s {device_id} exec-out run-as com.expensetracker cat files/expense_tracker.db > {tmp_db_path}"
    res = subprocess.run(pull_cmd, shell=True)
    if res.returncode != 0 or not os.path.exists(tmp_db_path) or os.path.getsize(tmp_db_path) == 0:
        print("❌ Failed to pull expense_tracker.db. Ensure the app has been launched on the device and 'Backfill Ledger' has been run.")
        sys.exit(1)

    print("✔ Successfully extracted database. Reading stored transactions...")
    conn = sqlite3.connect(tmp_db_path)
    cursor = conn.cursor()

    try:
        cursor.execute("""
            SELECT raw_message, amount, merchant, transaction_type, payment_mode, account, bank, available_balance
            FROM expenses
            WHERE raw_message IS NOT NULL AND length(trim(raw_message)) > 0
        """)
        rows = cursor.fetchall()
    except sqlite3.OperationalError as e:
        print(f"❌ Database read error: {e}")
        conn.close()
        sys.exit(1)

    conn.close()

    if not rows:
        print("⚠️ No transactions found in the database. Please open the app on your phone, go to Settings → Backfill Ledger, then re-run this command.")
        sys.exit(0)

    print(f"✔ Found {len(rows)} messages in phone database.")

    seen_messages = set()
    collected_samples = []

    for row in rows:
        raw_msg, amount, merchant, t_type, p_mode, account, bank, avl_bal = row
        if raw_msg in seen_messages:
            continue
        seen_messages.add(raw_msg)

        expected = {
            "amount": float(amount) if amount is not None else 0.0,
            "merchant": merchant if merchant else None,
            "transactionType": t_type if t_type else "debit",
            "paymentMode": p_mode if p_mode else "unknown",
            "account": str(account) if account else None,
            "bank": bank if bank else None
        }
        if avl_bal is not None:
            expected["availableBalance"] = float(avl_bal)

        collected_samples.append({
            "message": raw_msg,
            "expected": expected
        })

    fixtures_dir = os.path.join(os.path.dirname(__file__), "..", "src", "__tests__", "__fixtures__")
    os.makedirs(fixtures_dir, exist_ok=True)
    output_fixture = os.path.join(fixtures_dir, "collected-real-samples.json")

    with open(output_fixture, "w", encoding="utf-8") as f:
        json.dump(collected_samples, f, indent=2, ensure_ascii=False)

    print(f"✔ Saved {len(collected_samples)} unique test scenarios to:")
    print(f"   {output_fixture}")

    # Generate or update test file
    tests_dir = os.path.join(os.path.dirname(__file__), "..", "src", "__tests__")
    test_file_path = os.path.join(tests_dir, "collected-real.test.ts")
    
    test_content = """import { parseMessage } from '../core/parser/parseMessage';
import collectedSamples from './__fixtures__/collected-real-samples.json';

describe('Real Collected Phone Messages Test Suite', () => {
  test.each(collectedSamples)(
    'parses real message: "$message"',
    ({ message, expected }) => {
      const result = parseMessage(message, '', 'sms');
      if (expected.amount > 0) {
        expect(result.amount).toBe(expected.amount);
      }
      if (expected.transactionType) {
        expect(result.transactionType).toBe(expected.transactionType);
      }
      if (expected.bank) {
        expect(result.bank).toBe(expected.bank);
      }
      if (expected.account) {
        expect(result.account).toBe(expected.account);
      }
    }
  );
});
"""
    with open(test_file_path, "w", encoding="utf-8") as f:
        f.write(test_content)

    print(f"✔ Created test suite at:")
    print(f"   {test_file_path}")
    print("\n🚀 You can now run tests against your real messages anytime with:")
    print("   npm test src/__tests__/collected-real.test.ts\n")

if __name__ == "__main__":
    main()
