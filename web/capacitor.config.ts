import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'gov.rajasthan.jansunwai',
  appName: 'Jan Sunwai',
  webDir: 'public',
  server: {
    url: 'https://display-filename-rapids-alberta.trycloudflare.com',
    cleartext: true,
    androidScheme: 'https',
  },
  android: {
    allowMixedContent: true,
    captureInput: true,
    webContentsDebuggingEnabled: true,
  },
};

export default config;
