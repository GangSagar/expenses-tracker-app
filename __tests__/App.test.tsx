/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';

test('renders correctly', async () => {
  jest.useFakeTimers();
  
  await ReactTestRenderer.act(async () => {
    ReactTestRenderer.create(<App />);
  });
  
  // Fast-forward any deferred layouts or library timeouts (e.g. react-native-tab-view)
  ReactTestRenderer.act(() => {
    jest.runAllTimers();
  });
  
  jest.useRealTimers();
});
