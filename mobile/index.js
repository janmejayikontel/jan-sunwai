import { registerGlobals } from '@livekit/react-native';
registerGlobals();

import { registerRootComponent } from 'expo';
import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
registerRootComponent(App);
