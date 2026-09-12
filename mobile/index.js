import { registerRootComponent } from 'expo';
import App from './App';

try {
  const { registerGlobals } = require('@livekit/react-native');
  registerGlobals();
} catch (err) {
  console.warn('LiveKit registerGlobals error during initialization:', err);
}

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
registerRootComponent(App);
