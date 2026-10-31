#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$DIR/../.." && pwd)"
cd "$ROOT_DIR"

# Terminal Colors
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m' # No Color

show_help() {
  echo -e "${BOLD}${CYAN}SpendWise App Runner${NC}"
  echo -e "Usage: ${BOLD}./run app [platform] [options]${NC}\n"
  echo -e "${BOLD}Platforms:${NC}"
  echo -e "  ${GREEN}--android, -a${NC}    Build debug APK and launch on connected Android device/emulator"
  echo -e "  ${GREEN}--ios, -i${NC}        Build and launch on iOS simulator"
  echo -e "  ${GREEN}--help, -h${NC}       Show this help message\n"
}

ensure_android_ready() {
  if ! command -v adb >/dev/null 2>&1; then
    echo -e "${RED}❌ ADB command not found in PATH.${NC}"
    echo "Please ensure Android SDK platform-tools are in your PATH."
    exit 1
  fi

  # 1. Check if an online device or running emulator is already active
  local online_device
  online_device=$(adb devices 2>/dev/null | awk '$2 == "device" {print $1; exit}')

  if [ -n "$online_device" ]; then
    echo -e "${GREEN}✔ Online Android target detected:${NC} $online_device"
    return 0
  fi

  echo -e "${YELLOW}ℹ No online Android device detected. Checking emulator status...${NC}"

  # 2. Check if an emulator is currently booting or offline
  local running_emu
  running_emu=$(adb devices 2>/dev/null | awk '$2 == "offline" && $1 ~ /^emulator-/ {print $1; exit}')

  if [ -z "$running_emu" ]; then
    if ! command -v emulator >/dev/null 2>&1; then
      echo -e "${RED}❌ Android emulator binary not found in PATH.${NC}"
      echo "Please connect a physical device via USB or ensure Android SDK emulator is configured."
      exit 1
    fi

    local avd
    avd=$(emulator -list-avds 2>/dev/null | head -n 1)

    if [ -z "$avd" ]; then
      echo -e "${RED}❌ No active Android devices and no AVDs configured.${NC}"
      echo "Please connect a device via USB or create an AVD in Android Studio."
      exit 1
    fi

    echo -e "${CYAN}🚀 Launching emulator @${avd} in background...${NC}"
    nohup emulator @"$avd" >/dev/null 2>&1 &
  else
    echo -e "${CYAN}⏳ Found booting emulator (${running_emu}). Waiting for device connection...${NC}"
  fi

  echo -e "${CYAN}⏳ Waiting for ADB transport connection...${NC}"
  adb wait-for-device

  echo -e "${CYAN}⏳ Waiting for Android system boot to complete (sys.boot_completed=1)...${NC}"
  local timeout=90
  local elapsed=0
  local boot_status=""

  while [ "$boot_status" != "1" ] && [ $elapsed -lt $timeout ]; do
    sleep 2
    elapsed=$((elapsed + 2))
    boot_status=$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r\n')
    printf "   Booting Android... [%ds / %ds]\r" "$elapsed" "$timeout"
  done
  echo ""

  if [ "$boot_status" != "1" ]; then
    echo -e "${YELLOW}⚠️ Emulator did not finish booting within ${timeout}s. Proceeding with caution...${NC}"
  else
    echo -e "${GREEN}✔ Android emulator is fully booted and ready.${NC}"
  fi
}

case "${1:---android}" in
  --android|-a|android)
    shift || true
    echo -e "${BOLD}${CYAN}📱 Preparing Android build and deployment...${NC}"
    ensure_android_ready
    adb reverse tcp:8081 tcp:8081 2>/dev/null || true
    npx react-native run-android "$@"
    ;;
  --ios|-i|ios)
    shift || true
    echo -e "${BOLD}${GREEN}🍏 Building and deploying iOS app...${NC}"
    npx react-native run-ios "$@"
    ;;
  --help|-h|help)
    show_help
    ;;
  *)
    echo -e "${RED}Unknown app platform:${NC} $1"
    show_help
    exit 1
    ;;
esac
