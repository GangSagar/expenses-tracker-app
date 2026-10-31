# 🛠️ SpendWise Scripts & Tooling Directory

This directory contains command runners, emulator simulators, environment setup scripts, and quality assurance tools organized by domain.

---

## 📁 Directory Structure

```text
scripts/
├── runners/                       # Main command runners invoked by ./run
│   ├── run_app.sh                 # App build & launch runner (Android & iOS)
│   ├── run_clean.sh               # Cache, build & trace cleaner
│   ├── run_jaeger.sh              # Jaeger distributed tracing daemon manager
│   ├── run_parse.sh               # Headless SMS parser & diagnostic runner
│   ├── run_setup.sh               # Android SDK & environment verification
│   └── run_test.sh                # Test runner & simulator dispatcher
│
├── simulator/                     # Device interaction, data extraction & simulation
│   ├── simulate_message.sh        # Interactive & CLI simulator for SMS, notifications & spam
│   ├── collect-testcases.py       # Harvest real device SMS via ADB
│   ├── extract-device-messages.py # Device SQLite message extractor
│   ├── create-device-evaluation-draft.py # Evaluation dataset sampler
│   └── test-local-models.py       # Local ONNX/Llama model verification
│
├── setup/                         # Environment & asset generation utilities
│   ├── setup-android.js           # Android local.properties & SDK configuration
│   └── generate-icons.py          # App launcher icon generator
│
├── tools/                         # QA, verification & development tools
│   ├── parse-cli.js               # Standalone high-speed parser & benchmark
│   ├── test-backend.js            # Headless backend pipeline, AI Advisor & Jaeger verification
│   ├── check-import-boundaries.js # Architectural boundary lint check
│   └── verify_balance.mjs         # Balance calculation verification
│
└── jaeger/                        # Jaeger binary assets & trace logs
```

---

## 🚀 Quick Usage Guide

All scripts can be executed directly or via the project root command runner: `./run <command>`

### 1. Test & Simulation (`./run test`)
```bash
# Run unit test suites (719 passing tests)
./run test

# Open interactive message & notification simulator menu
./run test --simulate

# Simulate genuine transactions directly:
./run test -s sms HDFCBK "Dear Customer, your A/c XX1234 is debited for Rs 450.00 at SWIGGY"
./run test -s gpay "Paid ₹350 to Starbucks on Google Pay"
./run test -s phonepe "Paid ₹120 to Chai Point on PhonePe"
./run test -s paytm "Paid ₹500 at Shell Petrol Pump on Paytm"
./run test -s bhim "Sent Rs. 200.00 to Ramesh via BHIM UPI"
./run test -s message "Dear customer, your A/c XX9132 is debited for Rs 90.00"

# Test filter & spam classifier rejection:
./run test -s spam loan          # Pre-approved loan advertisement (Bayesian spam filter)
./run test -s spam otp           # Transaction OTP verification (OTP regex gate)
./run test -s spam login         # NetBanking login alert (Login regex gate)
./run test -s spam promo         # Marketing discount / cashback offer (Spam suppressor)
./run test -s spam personal      # Personal chat from 10-digit number (Sender filter)
./run test -s spam telecom       # Carrier data usage warning (Non-financial filter)

# Allow custom app package notifications:
./run test -s allow com.example.banking
```

### 2. Standalone Backend & AI Advisor Testing (`./run test --backend`)
Test SMS/notification parsing, transaction decisions, AI Budget Advisor, and Jaeger distributed traces without requiring an Android emulator or UI:
```bash
# Test a genuine bank SMS headlessly
./run test --backend "Dear Customer, A/c XX1234 debited for Rs 450.00 at SWIGGY - HDFC Bank"

# Test a payment app notification headlessly
./run test --backend "Paid ₹350.00 to Starbucks on Google Pay" com.google.android.apps.nbu.paisa

# Test spam filter rejection headlessly
./run test --backend "Instant loan of Rs 5 Lakhs approved! Click to claim." LOANS

# View the exported waterfall trace in Jaeger Web UI:
# http://localhost:16686
```

### 3. Application Build & Launch (`./run app`)
```bash
# Build and launch on Android emulator/device
./run app --android

# Build and launch on iOS simulator
./run app --ios
```

### 3. SMS Parser Diagnostics & Benchmark (`./run parse`)
```bash
# Parse a custom SMS string headlessly
./run parse "Sent Rs. 400.00 to Swiggy from HDFC Bank"

# Run parser throughput benchmark (1,000 iterations)
./run parse --benchmark 1000
```

### 4. Code Quality & Boundary Verification
```bash
# Verify architectural layer boundaries and lint code
npm run lint

# Auto-configure android/local.properties
npm run setup:android
```

