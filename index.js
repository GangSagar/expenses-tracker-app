/**
 * @format
 */

import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';
import { messageHeadlessTask } from './src/services/messaging/headlessMessageTask';

AppRegistry.registerComponent(appName, () => App);
AppRegistry.registerHeadlessTask('MessageHeadlessTask', () => messageHeadlessTask);
