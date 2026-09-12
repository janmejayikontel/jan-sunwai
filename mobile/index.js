// 1. Full WHATWG TextEncoder & TextDecoder polyfill supporting { fatal: true } for Hermes
const { TextEncoder, TextDecoder } = require('text-encoding-polyfill');
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

// 2. Register LiveKit WebRTC native globals
import { registerGlobals } from '@livekit/react-native';
try {
  registerGlobals();
} catch (err) {
  console.warn('LiveKit registerGlobals error:', err);
}

// 3. Register root component
import { registerRootComponent } from 'expo';
import App from './App';

registerRootComponent(App);
