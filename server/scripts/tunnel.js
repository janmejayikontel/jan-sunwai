const localtunnel = require('localtunnel');

async function startTunnel() {
  try {
    const tunnel = await localtunnel({ port: 8080, subdomain: 'jansunwai-rajasthan' });
    console.log('[Tunnel] Public URL:', tunnel.url);

    tunnel.on('close', () => {
      console.log('[Tunnel] Tunnel closed. Reconnecting in 3 seconds...');
      setTimeout(startTunnel, 3000);
    });

    tunnel.on('error', (err) => {
      console.error('[Tunnel] Error:', err.message);
    });
  } catch (err) {
    console.error('[Tunnel] Init error:', err.message);
    setTimeout(startTunnel, 5000);
  }
}

startTunnel();
