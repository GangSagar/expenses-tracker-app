#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$DIR")"
cd "$ROOT_DIR"

show_help() {
  echo "Usage: ./run parse [options] [message] [sender]"
  echo ""
  echo "Options:"
  echo "  --msg, -m <text>     The SMS message text to parse"
  echo "  --sender, -s <code>  The sender ID (defaults to HDFCBK)"
  echo "  --help, -h           Show this help message"
  echo ""
  echo "Examples:"
  echo "  ./run parse \"Dear Customer, A/c XX1234 debited for Rs 450.00 at SWIGGY\""
  echo "  ./run parse --msg \"Rs 1,500 credited to account XX5678\" --sender \"SBINB\""
}

msg=""
sender="HDFCBK"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --msg|-m)
      msg="$2"
      shift 2
      ;;
    --sender|-s)
      sender="$2"
      shift 2
      ;;
    --help|-h|help)
      show_help
      exit 0
      ;;
    *)
      if [ -z "$msg" ]; then
        msg="$1"
      elif [ "$sender" == "HDFCBK" ]; then
        sender="$1"
      fi
      shift
      ;;
  esac
done

if [ -z "$msg" ]; then
  echo "👉 Enter or paste your SMS message:"
  read -r msg
fi

if [ -z "$msg" ]; then
  echo "❌ Error: No message provided."
  exit 1
fi

MSG="$msg" SENDER="$sender" npx jest src/__tests__/diagnose.test.ts
