// WHATWG TextEncoder & TextDecoder Polyfill for Hermes JavaScript Engine
const { TextEncoder, TextDecoder } = require('text-encoding-polyfill');

global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

if (typeof window !== 'undefined') {
  window.TextEncoder = TextEncoder;
  window.TextDecoder = TextDecoder;
}
