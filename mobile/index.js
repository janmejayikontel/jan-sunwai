// 1. MUST BE FIRST: Polyfill TextEncoder & TextDecoder for Hermes before ANY module loads
require('./polyfill');

// 2. Register LiveKit & WebRTC native polyfills
const { registerGlobals } = require('@livekit/react-native');
try {
  registerGlobals();
} catch (err) {
  console.warn('LiveKit registerGlobals error:', err);
}

// 3. Load Expo root component registrar
const { registerRootComponent } = require('expo');

// 4. Load App component (after TextDecoder polyfill has safely attached to global)
const App = require('./App').default;

// 5. Register main component with AppRegistry
registerRootComponent(App);
