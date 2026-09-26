/**
 * Jan Sunwai Mobile Configuration
 *
 * Configures API and WebSocket endpoints for connecting to the Jan Sunwai server.
 * When testing on an Android Emulator:
 *   - Use http://10.0.2.2:3001 (maps to host localhost:3001)
 * When testing on a physical Android phone:
 *   - Use your computer's local Wi-Fi IP (e.g. http://192.168.x.x:3001) or public HTTPS tunnel
 */

import { Platform } from 'react-native';

export const DEFAULT_SERVER_URL = 'https://savannah-met-subdivision-multiple.trycloudflare.com';


export const CONFIG = {
  appName: 'Sampark Lite',
  appTitleHindi: 'संपर्क लाइट — राजस्थान सरकार',
  version: '1.0.0',

  defaultApiBase: DEFAULT_SERVER_URL,
  endpoints: {
    token: '/api/livekit/token',
    initiateCall: '/api/calls/initiate',
    respondCall: (callId: string) => `/api/calls/${callId}/respond`,
    endCall: (callId: string) => `/api/calls/${callId}/end`,
    leaveCall: (callId: string) => `/api/calls/${callId}/leave`,
    grievance: (id: string) => `/api/sampark/grievance/${encodeURIComponent(id)}`,
    wsSignal: (phone: string, base: string) => {
      const wsProto = base.startsWith('https') ? 'wss://' : 'ws://';
      const cleanHost = base.replace(/^https?:\/\//, '');
      return `${wsProto}${cleanHost}/ws?phone=${encodeURIComponent(phone)}`;
    },
  },
};
