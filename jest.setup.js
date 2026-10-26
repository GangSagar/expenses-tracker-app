// Jest setup file for mocking native modules in ExpenseTracker

// Mock react-native-quick-sqlite
jest.mock('react-native-quick-sqlite', () => {
  return {
    open: jest.fn(() => {
      let userVersion = 0;
      const tables = new Map();
      const rows = items => ({ _array: items, length: items.length, item: index => items[index] || null });
      return {
        execute: jest.fn(sql => {
          if (sql === 'PRAGMA user_version') {
            return { rows: rows([{ user_version: userVersion }]) };
          }
          const versionMatch = sql.match(/^PRAGMA user_version = (\d+)$/);
          if (versionMatch) userVersion = Number(versionMatch[1]);
          const createMatch = sql.match(/CREATE TABLE IF NOT EXISTS (\w+)/i);
          if (createMatch && !tables.has(createMatch[1])) {
            const body = sql.slice(sql.indexOf('(') + 1, sql.lastIndexOf(')'));
            const columns = body.split('\n').map(line => line.trim().replace(/,$/, '').split(/\s+/)[0])
              .filter(name => /^[a-z_]+$/i.test(name));
            tables.set(createMatch[1], new Set(columns));
          }
          const tableMatch = sql.match(/^PRAGMA table_info\((\w+)\)$/);
          if (tableMatch) {
            return { rows: rows(Array.from(tables.get(tableMatch[1]) || [], name => ({ name }))) };
          }
          const alterMatch = sql.match(/^ALTER TABLE (\w+) ADD COLUMN (\w+)/);
          if (alterMatch) tables.get(alterMatch[1])?.add(alterMatch[2]);
          return { rows: rows([]), rowsAffected: 0 };
        }),
        close: jest.fn(),
      };
    }),
  };
});

// Mock react-native-safe-area-context
jest.mock('react-native-safe-area-context', () => {
  const inset = { top: 0, right: 0, bottom: 0, left: 0 };
  return {
    SafeAreaProvider: ({ children }) => children,
    SafeAreaView: ({ children }) => children,
    useSafeAreaInsets: () => inset,
    useSafeAreaFrame: () => ({ x: 0, y: 0, width: 390, height: 844 }),
  };
});

// Mock react-native-screens
jest.mock('react-native-screens', () => {
  return {
    enableScreens: jest.fn(),
  };
});

// Mock react-native-pager-view
jest.mock('react-native-pager-view', () => {
  const React = require('react');
  const { View } = require('react-native');
  class PagerView extends React.Component {
    render() {
      return React.createElement(View, this.props, this.props.children);
    }
  }
  return {
    __esModule: true,
    default: PagerView,
    PagerView: PagerView,
  };
});

// Mock NativeModules.MessageModule for NativeEventEmitter
const { NativeModules } = require('react-native');
NativeModules.MessageModule = {
  addListener: jest.fn(),
  removeListeners: jest.fn(),
  getPendingMessages: jest.fn(() => Promise.resolve('[]')),
  showExpenseNotification: jest.fn(),
};
