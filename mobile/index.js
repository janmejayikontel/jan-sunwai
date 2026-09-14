// 1. MUST BE FIRST: Polyfill TextEncoder & TextDecoder for Hermes before ANY module loads
require('./polyfill');

// Global fetch interceptor: automatically adds Bypass-Tunnel-Reminder to bypass localtunnel warning pages
if (typeof global !== 'undefined' && global.fetch) {
  const originalFetch = global.fetch;
  global.fetch = function (resource, init) {
    const options = init ? { ...init } : {};
    if (!options.headers) {
      options.headers = { 'Bypass-Tunnel-Reminder': 'true' };
    } else if (typeof options.headers.set === 'function') {
      if (!options.headers.has('Bypass-Tunnel-Reminder') && !options.headers.has('bypass-tunnel-reminder')) {
        options.headers.set('Bypass-Tunnel-Reminder', 'true');
      }
    } else if (Array.isArray(options.headers)) {
      const hasHeader = options.headers.some(
        ([k]) => typeof k === 'string' && k.toLowerCase() === 'bypass-tunnel-reminder'
      );
      if (!hasHeader) {
        options.headers = [...options.headers, ['Bypass-Tunnel-Reminder', 'true']];
      }
    } else if (typeof options.headers === 'object') {
      const hasHeader = Object.keys(options.headers).some(
        (k) => k.toLowerCase() === 'bypass-tunnel-reminder'
      );
      if (!hasHeader) {
        options.headers = { ...options.headers, 'Bypass-Tunnel-Reminder': 'true' };
      }
    }
    return originalFetch(resource, options);
  };
}

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

