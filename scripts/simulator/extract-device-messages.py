#!/usr/bin/env python3
"""
Extract All Messages from Connected Android Device via ADB
Extracts both transactional and non-transactional messages from the phone's SMS repository
and exports them into JSON, CSV, and text formats.
"""

import subprocess
import json
import csv
import re
import os
import sys
from datetime import datetime

TYPE_MAP = {
    1: "INBOX",
    2: "SENT",
    3: "DRAFT",
    4: "OUTBOX",
    5: "FAILED",
    6: "QUEUED"
}

def get_connected_device():
    res = subprocess.run(["adb", "devices"], capture_output=True, text=True, errors="replace")
    lines = [line.strip() for line in res.stdout.splitlines() if line.strip() and not line.startswith("List of devices")]
    devices = [line.split()[0] for line in lines if "device" in line]
    if not devices:
        print("❌ No active Android devices found via ADB.")
        print("Please ensure your phone is connected with USB Debugging enabled.")
        sys.exit(1)
    return devices[0]

def extract_messages(device_id):
    print(f"📱 Connected device: {device_id}")
    print("⏳ Querying SMS content provider on device...")
    
    cmd = [
        "adb", "-s", device_id, "shell",
        "content query --uri content://sms --projection _id,thread_id,address,date,date_sent,read,type,body --sort 'date DESC'"
    ]
    
    res = subprocess.run(cmd, capture_output=True, text=True, errors="replace")
    if res.returncode != 0:
        print(f"❌ ADB query failed with error: {res.stderr}")
        sys.exit(1)
        
    lines = res.stdout.splitlines()
    row_regex = re.compile(
        r"^Row:\s*\d+\s+_id=(\d+),\s*thread_id=(\d+),\s*address=(.*?),\s*date=(\d+),\s*date_sent=(\d+),\s*read=(\d+),\s*type=(\d+),\s*body=(.*)$"
    )
    
    messages = []
    current_msg = None
    
    for line in lines:
        m = row_regex.match(line)
        if m:
            if current_msg:
                messages.append(current_msg)
            
            sms_id = int(m.group(1))
            thread_id = int(m.group(2))
            address = m.group(3)
            date_ms = int(m.group(4))
            date_sent_ms = int(m.group(5))
            read_status = int(m.group(6)) == 1
            sms_type = int(m.group(7))
            body = m.group(8)
            
            try:
                date_str = datetime.fromtimestamp(date_ms / 1000.0).strftime("%Y-%m-%d %H:%M:%S")
            except Exception:
                date_str = str(date_ms)
                
            try:
                date_sent_str = datetime.fromtimestamp(date_sent_ms / 1000.0).strftime("%Y-%m-%d %H:%M:%S") if date_sent_ms > 0 else None
            except Exception:
                date_sent_str = None
                
            current_msg = {
                "id": sms_id,
                "thread_id": thread_id,
                "sender": address,
                "timestamp_ms": date_ms,
                "date": date_str,
                "date_sent": date_sent_str,
                "type_code": sms_type,
                "type": TYPE_MAP.get(sms_type, f"UNKNOWN({sms_type})"),
                "read": read_status,
                "body": body
            }
        else:
            if current_msg is not None:
                current_msg["body"] += "\n" + line
                
    if current_msg:
        messages.append(current_msg)
        
    return messages

def save_exports(messages, output_dir):
    os.makedirs(output_dir, exist_ok=True)
    
    json_path = os.path.join(output_dir, "extracted_messages.json")
    csv_path = os.path.join(output_dir, "extracted_messages.csv")
    txt_path = os.path.join(output_dir, "extracted_messages.txt")
    
    # 1. JSON Export
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(messages, f, indent=2, ensure_ascii=False)
        
    # 2. CSV Export
    with open(csv_path, "w", encoding="utf-8", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["id", "thread_id", "sender", "date", "type", "read", "body"])
        for m in messages:
            writer.writerow([
                m["id"],
                m["thread_id"],
                m["sender"],
                m["date"],
                m["type"],
                m["read"],
                m["body"]
            ])
            
    # 3. Formatted Text Export
    with open(txt_path, "w", encoding="utf-8") as f:
        f.write(f"SMS DUMP FROM DEVICE ({len(messages)} MESSAGES)\n")
        f.write(f"Generated at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
        f.write("=" * 80 + "\n\n")
        for i, m in enumerate(messages, 1):
            f.write(f"[{i}/{len(messages)}] ID: {m['id']} | Type: {m['type']} | Sender: {m['sender']} | Date: {m['date']}\n")
            f.write("-" * 80 + "\n")
            f.write(f"{m['body']}\n")
            f.write("=" * 80 + "\n\n")
            
    return json_path, csv_path, txt_path

def main():
    device_id = get_connected_device()
    messages = extract_messages(device_id)
    
    project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    output_dir = os.path.join(project_root, "data")
    
    json_path, csv_path, txt_path = save_exports(messages, output_dir)
    
    print(f"\n✅ Successfully extracted {len(messages)} messages!")
    print(f"📁 Files saved:")
    print(f"   • JSON: {json_path}")
    print(f"   • CSV:  {csv_path}")
    print(f"   • Text: {txt_path}")
    
    # Print quick breakdown
    inbox_count = sum(1 for m in messages if m["type"] == "INBOX")
    sent_count = sum(1 for m in messages if m["type"] == "SENT")
    other_count = len(messages) - inbox_count - sent_count
    
    senders = {}
    for m in messages:
        senders[m["sender"]] = senders.get(m["sender"], 0) + 1
    top_senders = sorted(senders.items(), key=lambda x: x[1], reverse=True)[:5]
    
    print("\n📊 Extraction Summary:")
    print(f"   • Total Messages: {len(messages)}")
    print(f"   • Inbox Messages: {inbox_count}")
    print(f"   • Sent Messages:  {sent_count}")
    if other_count:
        print(f"   • Other Types:    {other_count}")
    if messages:
        print(f"   • Date Range:     {messages[-1]['date']} to {messages[0]['date']}")
    print(f"   • Unique Senders: {len(senders)}")
    print("   • Top Senders:")
    for sender, count in top_senders:
        print(f"     - {sender}: {count} messages")

if __name__ == "__main__":
    main()
