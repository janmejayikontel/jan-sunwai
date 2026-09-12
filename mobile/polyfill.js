/**
 * Hermes JavaScript Engine Runtime Polyfills
 *
 * Hermes does not include certain modern ECMAScript/Web APIs out of the box.
 * This file polyfills:
 *  1. TextEncoder & TextDecoder (WHATWG standard)
 *  2. WeakRef & FinalizationRegistry (ES2021)
 *
 * MUST be imported at the very top of index.js before any other module.
 */

// 1. WHATWG TextEncoder & TextDecoder Polyfill
const { TextEncoder, TextDecoder } = require('text-encoding-polyfill');

global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

if (typeof window !== 'undefined') {
  window.TextEncoder = TextEncoder;
  window.TextDecoder = TextDecoder;
}
if (typeof globalThis !== 'undefined') {
  globalThis.TextEncoder = TextEncoder;
  globalThis.TextDecoder = TextDecoder;
}

// 2. WeakRef Polyfill (ES2021)
if (typeof global.WeakRef === 'undefined' || (typeof globalThis !== 'undefined' && typeof globalThis.WeakRef === 'undefined')) {
  class WeakRefPolyfill {
    constructor(target) {
      if (target === null || (typeof target !== 'object' && typeof target !== 'function')) {
        throw new TypeError('WeakRef: target must be an object or function');
      }
      this._target = target;
    }

    deref() {
      return this._target;
    }
  }

  if (typeof Symbol !== 'undefined' && Symbol.toStringTag) {
    Object.defineProperty(WeakRefPolyfill.prototype, Symbol.toStringTag, {
      value: 'WeakRef',
      configurable: true,
    });
  }

  global.WeakRef = WeakRefPolyfill;
  if (typeof globalThis !== 'undefined') {
    globalThis.WeakRef = WeakRefPolyfill;
  }
  if (typeof window !== 'undefined') {
    window.WeakRef = WeakRefPolyfill;
  }
}

// 3. FinalizationRegistry Polyfill (ES2021)
if (typeof global.FinalizationRegistry === 'undefined' || (typeof globalThis !== 'undefined' && typeof globalThis.FinalizationRegistry === 'undefined')) {
  class FinalizationRegistryPolyfill {
    constructor(cleanupCallback) {
      if (typeof cleanupCallback !== 'function') {
        throw new TypeError('FinalizationRegistry: cleanupCallback must be a function');
      }
      this._cleanupCallback = cleanupCallback;
      this._registry = new Map();
    }

    register(target, heldValue, unregisterToken) {
      if (target === null || (typeof target !== 'object' && typeof target !== 'function')) {
        throw new TypeError('FinalizationRegistry.register: target must be an object or function');
      }
      if (unregisterToken !== undefined) {
        this._registry.set(unregisterToken, heldValue);
      }
    }

    unregister(unregisterToken) {
      if (unregisterToken === null || (typeof unregisterToken !== 'object' && typeof unregisterToken !== 'function')) {
        return false;
      }
      return this._registry.delete(unregisterToken);
    }
  }

  if (typeof Symbol !== 'undefined' && Symbol.toStringTag) {
    Object.defineProperty(FinalizationRegistryPolyfill.prototype, Symbol.toStringTag, {
      value: 'FinalizationRegistry',
      configurable: true,
    });
  }

  global.FinalizationRegistry = FinalizationRegistryPolyfill;
  if (typeof globalThis !== 'undefined') {
    globalThis.FinalizationRegistry = FinalizationRegistryPolyfill;
  }
  if (typeof window !== 'undefined') {
    window.FinalizationRegistry = FinalizationRegistryPolyfill;
  }
}
