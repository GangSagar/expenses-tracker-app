// Jest setup file for mocking native modules in ExpenseTracker

// Mock react-native-quick-sqlite
jest.mock('react-native-quick-sqlite', () => {
  return {
    open: jest.fn(() => ({
      execute: jest.fn(() => ({
        rows: {
          _array: [],
          length: 0,
          item: () => null,
        },
      })),
      close: jest.fn(),
    })),
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
};
