#!/usr/bin/env bash

# Usage: ./scripts/parse-sms.sh "Your bank SMS text here" "OPTIONAL_SENDER"

MSG="$1"
SENDER="${2:-HDFCBK}"

if [ -z "$MSG" ]; then
  echo "👉 Enter or paste your SMS message:"
  read -r MSG
fi

if [ -z "$MSG" ]; then
  echo "❌ Error: No message provided."
  exit 1
fi

MSG="$MSG" SENDER="$SENDER" npx jest src/__tests__/diagnose.test.ts
