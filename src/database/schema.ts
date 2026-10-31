export const CREATE_EXPENSES_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    amount REAL NOT NULL,
    merchant TEXT,
    alias TEXT,
    category TEXT,
    confidence REAL,
    timestamp INTEGER NOT NULL,
    source TEXT NOT NULL,
    raw_message TEXT NOT NULL,
    transaction_type TEXT NOT NULL DEFAULT 'debit',
    account TEXT,
    bank TEXT,
    payment_mode TEXT DEFAULT 'unknown',
    is_duplicate INTEGER DEFAULT 0,
    available_balance REAL,
    splits TEXT,
    reference_id TEXT,
    is_invalid INTEGER DEFAULT 0,
    trash_reason TEXT,
    tags TEXT,
    notes TEXT,
    bill_image_uri TEXT,
    location TEXT,
    created_at INTEGER DEFAULT (strftime('%s', 'now'))
  );
`;

export const CREATE_MERCHANT_CATEGORIES_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS merchant_categories (
    merchant TEXT PRIMARY KEY,
    category TEXT NOT NULL,
    display_name TEXT
  );
`;

export const CREATE_SETTINGS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`;

export const CREATE_CLASSIFIER_STATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS classifier_state (
    key TEXT PRIMARY KEY,
    model_json TEXT NOT NULL
  );
`;
