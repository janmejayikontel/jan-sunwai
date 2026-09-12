// 1. Polyfill TextEncoder & TextDecoder for Hermes before any modules evaluate
import 'fast-text-encoding';

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
