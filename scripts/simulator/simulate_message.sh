#!/usr/bin/env bash
# ==============================================================================
# SpendWise SMS & Notification Simulation Utility
# Sends real SMS or simulated payment notifications to an Android emulator/device
# and verifies pipeline filtering, spam classification, and ledger persistence.
# ==============================================================================

set -e

# Terminal Colors
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
BOLD='\033[1m'
NC='\033[0m' # No Color

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$DIR/../.." && pwd)"

# Known Package Names
PKG_GPAY="com.google.android.apps.nbu.paisa"
PKG_PHONEPE="com.phonepe.app"
PKG_PAYTM="net.one97.paytm"
PKG_BHIM="in.org.npci.upiapp"
PKG_MESSAGES="com.google.android.apps.messaging"
PKG_CRED="com.dreamplug.androidapp"

# ------------------------------------------------------------------------------
# Device Detection
# ------------------------------------------------------------------------------
get_device() {
  if ! command -v adb >/dev/null 2>&1; then
    echo -e "${RED}❌ 'adb' command not found.${NC} Please ensure Android SDK platform-tools are in your PATH."
    exit 1
  fi

  local devices
  devices=$(adb devices | grep -w "device" | awk '{print $1}')
  
  if [ -z "$devices" ]; then
    echo -e "${RED}❌ No connected Android device or emulator detected.${NC}"
    echo -e "   Please launch an Android emulator from Android Studio or run: ${YELLOW}./run app --android${NC}"
    exit 1
  fi

  # Prefer emulator if available
  local target_device=""
  for dev in $devices; do
    if [[ "$dev" == emulator* ]]; then
      target_device="$dev"
      break
    fi
  done

  if [ -z "$target_device" ]; then
    target_device=$(echo "$devices" | head -n 1)
  fi

  echo "$target_device"
}

# ------------------------------------------------------------------------------
# Dispatcher & Delivery
# ------------------------------------------------------------------------------
ensure_permissions() {
  local dev="$1"
  adb -s "$dev" shell pm grant com.expensetracker android.permission.RECEIVE_SMS 2>/dev/null || true
  adb -s "$dev" shell pm grant com.expensetracker android.permission.READ_SMS 2>/dev/null || true
  adb -s "$dev" shell pm grant com.expensetracker android.permission.POST_NOTIFICATIONS 2>/dev/null || true
  adb -s "$dev" shell pm grant com.expensetracker android.permission.ACCESS_FINE_LOCATION 2>/dev/null || true
  adb -s "$dev" shell pm grant com.expensetracker android.permission.ACCESS_COARSE_LOCATION 2>/dev/null || true
  adb -s "$dev" reverse tcp:4318 tcp:4318 2>/dev/null || true
}

deliver_message() {
  local dev="$1"
  local type="$2"   # "sms" or "notification"
  local sender="$3"
  local body="$4"
  local desc="${5:-Simulated Message}"

  ensure_permissions "$dev"

  echo -e "\n${BOLD}${CYAN}------------------------------------------------------------${NC}"
  echo -e "${BOLD}📤 Dispatching:${NC} ${MAGENTA}$desc${NC}"
  echo -e "   ${BOLD}Target Device:${NC} $dev"
  echo -e "   ${BOLD}Source Type:${NC}   $type"
  echo -e "   ${BOLD}Sender ID:${NC}     $sender"
  echo -e "   ${BOLD}Body:${NC}          \"$body\""
  echo -e "${CYAN}------------------------------------------------------------${NC}"

  # Clear logcat buffer for ExpenseTracker
  adb -s "$dev" logcat -c 2>/dev/null || true

  if [ "$type" == "sms" ] && [[ "$dev" == emulator* ]]; then
    # 1. Real emulator telephony SMS
    echo -e "   ${BLUE}↳ Injecting via emulator telephony (SmsReceiver)...${NC}"
    adb -s "$dev" emu sms send "$sender" "$body" 2>/dev/null || true
  fi

  # 2. Broadcast backup with safe escaping and standard simulated coordinates
  local safe_sender="${sender//\'/\'\\\'\'}"
  local safe_body="${body//\'/\'\\\'\'}"
  local sim_lat="${LATITUDE:-12.9716}"
  local sim_lng="${LONGITUDE:-77.5946}"
  adb -s "$dev" shell "am broadcast -p com.expensetracker -a com.expensetracker.SIMULATE_MESSAGE --es sender '$safe_sender' --es body '$safe_body' --es source '$type' --ef latitude $sim_lat --ef longitude $sim_lng" >/dev/null 2>&1 || true

  echo -e "   ${GREEN}✔ Delivered to device!${NC} Listening for pipeline decision..."

  # Capture logcat for 2.5 seconds
  echo -e "\n${BOLD}🔍 [Pipeline Processing Analysis]:${NC}"
  sleep 1.5

  local logs
  logs=$(adb -s "$dev" logcat -d -s ExpenseTracker:D ReactNativeJS:I 2>/dev/null || true)

  local found_decision=false
  local trace_id=""

  while IFS= read -r line; do
    local lower_line
    lower_line=$(echo "$line" | tr '[:upper:]' '[:lower:]')

    if [[ "$lower_line" == *"[telemetry] trace id:"* ]]; then
      trace_id=$(echo "$line" | sed -E 's/.*\[Telemetry\] Trace ID: ([a-f0-9]+).*/\1/')
    fi

    if [[ "$lower_line" == *"decision:"* ]]; then
      found_decision=true
      if [[ "$lower_line" == *"auto_save"* ]]; then
        echo -e "   ${BOLD}Decision:${NC}        ${GREEN}✅ AUTO_SAVE (Saved to SQLite Ledger)${NC}"
      elif [[ "$lower_line" == *"review"* || "$lower_line" == *"show_popup"* ]]; then
        echo -e "   ${BOLD}Decision:${NC}        ${YELLOW}⚠️  REVIEW / POPUP (Queued for user confirmation)${NC}"
      elif [[ "$lower_line" == *"reject"* || "$lower_line" == *"ignore"* ]]; then
        echo -e "   ${BOLD}Decision:${NC}        ${RED}🛑 REJECT (Filtered / Blocked)${NC}"
      else
        local dec_val
        dec_val=$(echo "$line" | sed -E 's/.*[Dd]ecision: ([a-zA-Z_]+).*/\1/')
        echo -e "   ${BOLD}Decision:${NC}        ${YELLOW}$dec_val${NC}"
      fi
      local reason
      reason=$(echo "$line" | sed -E 's/.*[Dd]ecision: [a-zA-Z_]+ \(([^)]+)\).*/\1/')
      if [ -n "$reason" ] && [ "$reason" != "$line" ]; then
        echo -e "   ${BOLD}Reason Code:${NC}     $reason"
      fi
    fi
    if [[ "$line" == *"Auto-saved expense to DB with ID:"* ]]; then
      local id
      id=$(echo "$line" | awk -F'ID: ' '{print $2}')
      echo -e "   ${BOLD}Database Write:${NC}  ${GREEN}✔ Created expense row #${id}${NC}"
    fi
    if [[ "$line" == *"Expense was not saved because it matched an existing transaction"* ]]; then
      echo -e "   ${BOLD}Deduplication:${NC}   ${YELLOW}Matched existing transaction (duplicate skipped)${NC}"
    fi
  done <<< "$logs"

  if [ "$found_decision" = false ]; then
    echo -e "   ${YELLOW}ℹ️  No immediate JS decision logged. (Ensure the app is launched on the device).${NC}"
  fi

  # ----------------------------------------------------------------------------
  # 3. Direct SQLite Database Inspection on Connected Device
  # ----------------------------------------------------------------------------
  local db_tmp="/tmp/expense_tracker_simulator.db"
  if adb -s "$dev" exec-out run-as com.expensetracker cat files/expense_tracker.db > "$db_tmp" 2>/dev/null && [ -s "$db_tmp" ]; then
    local latest_row
    latest_row=$(sqlite3 "$db_tmp" "SELECT id, merchant, amount, category, bank, account, transaction_type, is_invalid, reference_id, tags, notes, bill_image_uri, location FROM expenses ORDER BY id DESC LIMIT 1;" 2>/dev/null || true)
    if [ -n "$latest_row" ]; then
      IFS='|' read -r r_id r_merchant r_amount r_cat r_bank r_acct r_type r_inv r_ref r_tags r_notes r_bill r_loc <<< "$latest_row"
      echo -e "\n${BOLD}💾 [SQLite Database Verification]:${NC}"
      echo -e "   ${GREEN}✔ Latest Persisted Row in DB (#${r_id}):${NC}"
      echo -e "   • Merchant:      ${BOLD}${r_merchant}${NC}"
      echo -e "   • Amount:        ${BOLD}₹${r_amount}${NC}"
      echo -e "   • Category:      ${BOLD}${r_cat}${NC}"
      local bank_str="${r_bank:-Unknown}"
      if [ -n "$r_acct" ]; then
        bank_str="$bank_str (A/c XX$r_acct)"
      fi
      echo -e "   • Bank / Acct:   ${BOLD}${bank_str}${NC}"
      if [ -n "$r_ref" ] && [ "$r_ref" != "null" ]; then
        echo -e "   • Txn / Ref ID:  ${BOLD}${r_ref}${NC}"
      fi
      if [ -n "$r_tags" ] && [ "$r_tags" != "null" ]; then
        echo -e "   • Tags:          ${BOLD}${r_tags}${NC}"
      fi
      if [ -n "$r_notes" ] && [ "$r_notes" != "null" ]; then
        echo -e "   • Notes:         ${BOLD}${r_notes}${NC}"
      fi
      if [ -n "$r_bill" ] && [ "$r_bill" != "null" ]; then
        echo -e "   • Bill Image:    ${BOLD}${r_bill}${NC}"
      fi
      if [ -n "$r_loc" ] && [ "$r_loc" != "null" ]; then
        echo -e "   • Map Location:  ${CYAN}${r_loc}${NC}"
      fi
      local status_label="${GREEN}ACTIVE (is_invalid=0)${NC}"
      if [ "$r_inv" = "1" ]; then
        status_label="${RED}TRASHED (is_invalid=1)${NC}"
      fi
      echo -e "   • Ledger Status: $status_label"
    fi

    # --------------------------------------------------------------------------
    # 4. AI Smart Budget Advisor Evaluation on Active Ledger
    # --------------------------------------------------------------------------
    if [ ! -f "$ROOT_DIR/dist/services/advisor/advisorService.js" ]; then
      npx tsc "$ROOT_DIR/src/services/advisor/advisorService.ts" --module commonjs --target es2020 --moduleResolution node --resolveJsonModule --esModuleInterop --outDir "$ROOT_DIR/dist" --skipLibCheck >/dev/null 2>&1 || true
    fi

    local advisor_json
    advisor_json=$(node -e '
      try {
        const { execSync } = require("child_process");
        const raw = execSync("sqlite3 /tmp/expense_tracker_simulator.db \".mode json\" \"SELECT * FROM expenses WHERE is_invalid=0;\"", { stdio: ["pipe", "pipe", "ignore"] }).toString();
        const rows = JSON.parse(raw);
        const expenses = rows.map(e => ({
          id: e.id,
          amount: e.amount,
          merchant: e.merchant,
          category: e.category,
          transactionType: e.transaction_type,
          timestamp: e.timestamp,
          isInvalid: e.is_invalid === 1,
        }));
        const { generateBudgetInsights } = require("'"$ROOT_DIR"'/dist/services/advisor/advisorService.js");
        const insights = generateBudgetInsights(expenses, 20000);
        console.log(JSON.stringify(insights));
      } catch (e) {}
    ' 2>/dev/null || true)

    if [ -n "$advisor_json" ]; then
      echo -e "\n${BOLD}✨ [AI Smart Budget Advisor Analysis]:${NC}"
      node -e '
        const d = JSON.parse(process.argv[1]);
        const statusBadge = d.status === "good" ? "\x1b[32m✔ ON TRACK (Good)\x1b[0m" : d.status === "warning" ? "\x1b[33m⚠️ WARNING\x1b[0m" : "\x1b[31m🚨 CRITICAL\x1b[0m";
        console.log("   • Status:        " + statusBadge);
        console.log("   • Headline:      \x1b[1m" + d.headline + "\x1b[0m");
        console.log("   • Daily Burn:    ₹" + d.dailyBurnRate + "/day");
        console.log("   • Month Project: ₹" + d.projectedExpense + " (Est. Savings: ₹" + d.savingsEstimate + ")");
        const adviceLines = d.message.split("\n");
        console.log("   • Micro-Advice:  " + adviceLines[0]);
        if (adviceLines.length > 1) {
          for (let i = 1; i < adviceLines.length; i++) {
            if (adviceLines[i].trim()) console.log("                    " + adviceLines[i].trim());
          }
        }
      ' "$advisor_json" 2>/dev/null || true
    fi
  fi

  # ----------------------------------------------------------------------------
  # 5. Distributed Tracing (Jaeger) Information
  # ----------------------------------------------------------------------------
  if [ -n "$trace_id" ]; then
    echo -e "\n${BOLD}🌐 [Distributed Tracing (Jaeger)]:${NC}"
    echo -e "   • Trace ID:      ${BOLD}${trace_id}${NC}"
    echo -e "   • Waterfall UI:  ${CYAN}http://localhost:16686/trace/${trace_id}${NC}"
  elif curl -s "http://localhost:16686/api/traces?service=expense-tracker-mobile&limit=1" >/dev/null 2>&1; then
    local recent_trace
    recent_trace=$(node -e '
      fetch("http://localhost:16686/api/traces?service=expense-tracker-mobile&limit=1")
        .then(r => r.json())
        .then(d => {
          if (d.data && d.data.length > 0) {
            console.log(d.data[0].traceID);
          }
        }).catch(() => {});
    ' 2>/dev/null || true)
    if [ -n "$recent_trace" ]; then
      echo -e "\n${BOLD}🌐 [Distributed Tracing (Jaeger)]:${NC}"
      echo -e "   • Recent Trace:  ${BOLD}${recent_trace}${NC}"
      echo -e "   • Waterfall UI:  ${CYAN}http://localhost:16686/trace/${recent_trace}${NC}"
    fi
  fi

  echo -e "${CYAN}------------------------------------------------------------${NC}\n"
}

# ------------------------------------------------------------------------------
# Predefined Test Cases
# ------------------------------------------------------------------------------

# --- Genuine Transactions ---
test_sms_debit() {
  local dev="$1"
  deliver_message "$dev" "sms" "HDFCBK" \
    "Dear Customer, your A/c XX1234 is debited for Rs 450.00 on 30-Oct-26 at SWIGGY - HDFC Bank" \
    "Genuine Bank SMS Debit (HDFC - Swiggy)"
}

test_sms_icici() {
  local dev="$1"
  deliver_message "$dev" "sms" "ICICIB" \
    "INR 1,250.00 spent on ICICI Bank Card XX4000 on 30-Oct-26 at AMAZON INDIA. Avl Limit: INR 45,000.00." \
    "Genuine Bank Credit Card Spend (ICICI - Amazon)"
}

test_sms_credit() {
  local dev="$1"
  deliver_message "$dev" "sms" "SBIINB" \
    "Dear UPI user A/C 9876 credited by Rs 1500.00 on 30Oct26 transfer from Rahul Sharma Ref 628597769620" \
    "Genuine UPI Repayment Credit (SBI - Split Settlement)"
}

test_notif_gpay() {
  local dev="$1"
  deliver_message "$dev" "notification" "$PKG_GPAY" \
    "Paid ₹350.00 to Starbucks on Google Pay" \
    "Google Pay Push Notification"
}

test_notif_phonepe() {
  local dev="$1"
  deliver_message "$dev" "notification" "$PKG_PHONEPE" \
    "Paid ₹120 to Chai Point on PhonePe" \
    "PhonePe Push Notification"
}

test_notif_paytm() {
  local dev="$1"
  deliver_message "$dev" "notification" "$PKG_PAYTM" \
    "Paid ₹500 at Shell Petrol Pump on Paytm" \
    "Paytm Push Notification"
}

test_notif_bhim() {
  local dev="$1"
  deliver_message "$dev" "notification" "$PKG_BHIM" \
    "Sent Rs. 200.00 to Ramesh via BHIM UPI Ref 628597769620" \
    "BHIM UPI (BHIMUPI) Push Notification"
}

test_notif_messages() {
  local dev="$1"
  deliver_message "$dev" "notification" "$PKG_MESSAGES" \
    "A/c XX9132 debited for Rs 90.00 at POHA ON WHEELS BELLANDUR. Bal Rs 4,039.12" \
    "Messages App (Google Messages) Notification"
}

# --- Filter & Spam Test Cases ---
test_spam_loan() {
  local dev="$1"
  deliver_message "$dev" "sms" "LM-HDFCBK" \
    "Congratulations! You are pre-approved for an Instant Personal Loan of Rs. 5,00,000 at 10.5% interest with zero processing fee. Apply now: https://hdfc.bank/loan" \
    "Pre-Approved Loan Advertisement (Spam Filter Test)"
}

test_spam_otp() {
  local dev="$1"
  deliver_message "$dev" "sms" "VK-HDFCBK" \
    "482910 is your secret OTP for HDFC Bank NetBanking transaction of Rs 2,400.00. Valid for 10 mins. Do not share with anyone." \
    "Bank Transaction OTP / Security Code (Regex Gate Test)"
}

test_spam_login() {
  local dev="$1"
  deliver_message "$dev" "sms" "AX-ICICIB" \
    "Alert: A new login to your ICICI Bank NetBanking was detected from Chrome on Windows at 04:30 AM. If not you, call 18002662." \
    "NetBanking Login Alert (Login Filter Test)"
}

test_spam_promo() {
  local dev="$1"
  deliver_message "$dev" "sms" "BZ-SWIGGY" \
    "Flat 50% OFF on your favorite meals! Spend min Rs 200 on Swiggy with your Axis Card and get instant discount. Use code FESTIVE50." \
    "Promotional Discount & Marketing Offer (Bayes Filter Test)"
}

test_spam_personal() {
  local dev="$1"
  deliver_message "$dev" "sms" "+919876543210" \
    "Hey, can you pay Rs 500 to the cab driver? I will transfer it to you later tonight." \
    "Personal Chat SMS (10-Digit Sender Filter Test)"
}

test_spam_telecom() {
  local dev="$1"
  deliver_message "$dev" "sms" "VM-JioBal" \
    "Dear customer, you have consumed 100% of your daily high-speed data limit. Recharge with 1.5GB at Rs 19." \
    "Carrier Telecom Data Warning (Non-transactional Test)"
}

# ------------------------------------------------------------------------------
# Custom Package Whitelisting
# ------------------------------------------------------------------------------
allow_custom_package() {
  local dev="$1"
  local pkg="$2"

  if [ -z "$pkg" ]; then
    read -rp "Enter Android Package Name (e.g. com.example.app): " pkg
  fi

  if [ -z "$pkg" ]; then
    echo -e "${RED}Package name cannot be empty.${NC}"
    return
  fi

  echo -e "Granting notification access to: ${CYAN}$pkg${NC} on $dev..."
  adb -s "$dev" shell am broadcast \
    -a com.expensetracker.ALLOW_PACKAGE \
    --es package "$pkg" 2>/dev/null || true
  echo -e "${GREEN}✔ Requested package whitelisting for $pkg!${NC}"
}

# ------------------------------------------------------------------------------
# Interactive Menu
# ------------------------------------------------------------------------------
interactive_menu() {
  local dev="$1"

  while true; do
    echo -e "${BOLD}${CYAN}============================================================${NC}"
    echo -e "${BOLD}${CYAN}     SpendWise Message & Notification Simulator            ${NC}"
    echo -e "${BOLD}${CYAN}============================================================${NC}"
    echo -e "Connected device: ${GREEN}$dev${NC}\n"

    echo -e "${BOLD}💳 Genuine Financial Transactions:${NC}"
    echo -e "  ${GREEN}1)${NC} Bank SMS Debit (HDFC - Swiggy ₹450)"
    echo -e "  ${GREEN}2)${NC} Bank Credit Card Spend (ICICI - Amazon ₹1,250)"
    echo -e "  ${GREEN}3)${NC} UPI Repayment Credit (SBI - Rahul Sharma ₹1,500)"
    echo -e "  ${GREEN}4)${NC} Google Pay Notification (GPay ₹350 to Starbucks)"
    echo -e "  ${GREEN}5)${NC} PhonePe Notification (₹120 to Chai Point)"
    echo -e "  ${GREEN}6)${NC} Paytm Notification (₹500 at Shell)"
    echo -e "  ${GREEN}7)${NC} BHIM UPI (BHIMUPI) Notification (₹200 to Ramesh)"
    echo -e "  ${GREEN}8)${NC} Messages App Notification (SMS Notification ₹90)"
    echo ""
    echo -e "${BOLD}🛡️ Filter & Spam Test Cases:${NC}"
    echo -e "  ${YELLOW}9)${NC}  Pre-Approved Personal Loan Spam (Bayes Classifier Test)"
    echo -e "  ${YELLOW}10)${NC} Bank OTP / Verification Alert (OTP Regex Test)"
    echo -e "  ${YELLOW}11)${NC} NetBanking Login Alert (Login Regex Test)"
    echo -e "  ${YELLOW}12)${NC} Promotional Discount Marketing Ad (Marketing Suppressor Test)"
    echo -e "  ${YELLOW}13)${NC} Personal Chat from 10-Digit Mobile (Sender Filter Test)"
    echo -e "  ${YELLOW}14)${NC} Carrier Data Exhaustion Warning (Non-financial Test)"
    echo ""
    echo -e "${BOLD}⚙️ Custom & Tools:${NC}"
    echo -e "  ${BLUE}15)${NC} Custom SMS Message (Custom Sender & Text)"
    echo -e "  ${BLUE}16)${NC} Custom App Notification (Custom Package & Text)"
    echo -e "  ${BLUE}17)${NC} Grant Notification Access to New App Package"
    echo -e "  ${BLUE}18)${NC} Tail Live Logcat Streams"
    echo -e "  ${RED}q)${NC}  Quit"
    echo ""
    read -rp "Select an option [1-18, q]: " choice

    case "$choice" in
      1) test_sms_debit "$dev" ;;
      2) test_sms_icici "$dev" ;;
      3) test_sms_credit "$dev" ;;
      4) test_notif_gpay "$dev" ;;
      5) test_notif_phonepe "$dev" ;;
      6) test_notif_paytm "$dev" ;;
      7) test_notif_bhim "$dev" ;;
      8) test_notif_messages "$dev" ;;
      9) test_spam_loan "$dev" ;;
      10) test_spam_otp "$dev" ;;
      11) test_spam_login "$dev" ;;
      12) test_spam_promo "$dev" ;;
      13) test_spam_personal "$dev" ;;
      14) test_spam_telecom "$dev" ;;
      15)
        read -rp "Enter Sender (e.g. HDFCBK or AXISBK): " csender
        read -rp "Enter Message text: " ctext
        deliver_message "$dev" "sms" "$csender" "$ctext" "Custom Bank SMS"
        ;;
      16)
        read -rp "Enter App Package (e.g. com.example.banking): " cpkg
        read -rp "Enter Notification text: " ctext
        deliver_message "$dev" "notification" "$cpkg" "$ctext" "Custom App Notification"
        ;;
      17)
        allow_custom_package "$dev" ""
        ;;
      18)
        echo -e "${CYAN}Tailing live logs for ExpenseTracker (Press Ctrl+C to stop)...${NC}"
        adb -s "$dev" logcat -s ExpenseTracker:D ReactNativeJS:I
        ;;
      q|Q)
        echo "Goodbye!"
        exit 0
        ;;
      *)
        echo -e "${RED}Invalid selection.${NC}"
        ;;
    esac

    echo ""
    read -rp "Press Enter to return to menu..."
  done
}

# ------------------------------------------------------------------------------
# Help / CLI Usage
# ------------------------------------------------------------------------------
show_help() {
  echo -e "${BOLD}${CYAN}SpendWise Message & Notification Simulator${NC}"
  echo "Usage: ./run test --simulate [command / option] [arguments]"
  echo ""
  echo "Interactive Mode:"
  echo "  (no args), -i, --interactive    Open interactive menu"
  echo ""
  echo "Direct Transaction Simulations:"
  echo "  sms <sender> <message>          Send bank SMS"
  echo "  gpay [message]                  Simulate Google Pay notification"
  echo "  phonepe [message]               Simulate PhonePe notification"
  echo "  paytm [message]                 Simulate Paytm notification"
  echo "  bhim [message]                  Simulate BHIM UPI notification"
  echo "  message [message]               Simulate Google Messages app notification"
  echo ""
  echo "Filter & Spam Test Cases:"
  echo "  spam loan                       Test pre-approved loan advertisement"
  echo "  spam otp                        Test transaction OTP alert"
  echo "  spam login                      Test NetBanking login alert"
  echo "  spam promo                      Test promotional discount / cashback offer"
  echo "  spam personal                   Test personal chat from 10-digit number"
  echo "  spam telecom                    Test carrier telecom warning"
  echo ""
  echo "App Management:"
  echo "  allow <package>                 Grant notification permission to app package"
  echo "  custom <pkg_or_sender> <msg>    Send custom event"
  echo "  logcat                          Stream live ExpenseTracker logcat output"
}

# ------------------------------------------------------------------------------
# Main Entry Point
# ------------------------------------------------------------------------------
if [ "${1:-}" == "--help" ] || [ "${1:-}" == "-h" ] || [ "${1:-}" == "help" ]; then
  show_help
  exit 0
fi

TARGET_DEVICE=$(get_device)

case "${1:-}" in
  ""|--interactive|-i|interactive)
    interactive_menu "$TARGET_DEVICE"
    ;;
  sms)
    deliver_message "$TARGET_DEVICE" "sms" "${2:-HDFCBK}" "${3:-Dear Customer, your A/c XX1234 is debited for Rs 450.00 on 30-Oct-26 at SWIGGY - HDFC Bank}" "Bank SMS"
    ;;
  gpay)
    deliver_message "$TARGET_DEVICE" "notification" "$PKG_GPAY" "${2:-Paid ₹350.00 to Starbucks on Google Pay}" "Google Pay Notification"
    ;;
  phonepe)
    deliver_message "$TARGET_DEVICE" "notification" "$PKG_PHONEPE" "${2:-Paid ₹120 to Chai Point on PhonePe}" "PhonePe Notification"
    ;;
  paytm)
    deliver_message "$TARGET_DEVICE" "notification" "$PKG_PAYTM" "${2:-Paid ₹500 at Shell Petrol Pump on Paytm}" "Paytm Notification"
    ;;
  bhim)
    deliver_message "$TARGET_DEVICE" "notification" "$PKG_BHIM" "${2:-Sent Rs. 200.00 to Ramesh via BHIM UPI Ref 628597769620}" "BHIM UPI Notification"
    ;;
  message|messages)
    deliver_message "$TARGET_DEVICE" "notification" "$PKG_MESSAGES" "${2:-A/c XX9132 debited for Rs 90.00 at POHA ON WHEELS BELLANDUR. Bal Rs 4,039.12}" "Messages Notification"
    ;;
  spam)
    case "${2:-loan}" in
      loan) test_spam_loan "$TARGET_DEVICE" ;;
      otp) test_spam_otp "$TARGET_DEVICE" ;;
      login) test_spam_login "$TARGET_DEVICE" ;;
      promo) test_spam_promo "$TARGET_DEVICE" ;;
      personal) test_spam_personal "$TARGET_DEVICE" ;;
      telecom) test_spam_telecom "$TARGET_DEVICE" ;;
      *)
        echo -e "${RED}Unknown spam test type:${NC} $2"
        echo "Supported types: loan, otp, login, promo, personal, telecom"
        exit 1
        ;;
    esac
    ;;
  allow)
    allow_custom_package "$TARGET_DEVICE" "$2"
    ;;
  custom)
    deliver_message "$TARGET_DEVICE" "${4:-notification}" "$2" "$3" "Custom Event"
    ;;
  logcat)
    adb -s "$TARGET_DEVICE" logcat -s ExpenseTracker:D ReactNativeJS:I
    ;;
  --help|-h|help)
    show_help
    ;;
  *)
    echo -e "${RED}Unknown simulator option:${NC} $1"
    show_help
    exit 1
    ;;
esac
