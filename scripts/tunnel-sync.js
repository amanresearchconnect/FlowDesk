const localtunnel = require('localtunnel');
const fs = require('fs');

const envContent = fs.readFileSync('.env', 'utf8');
const getVal = (k) => {
  const m = envContent.match(new RegExp('^' + k + '=(.*)$', 'm'));
  return m ? m[1].trim() : '';
};

const appId = '1536005901890820';
const appSecret = getVal('WHATSAPP_APP_SECRET');
const appAccessToken = `${appId}|${appSecret}`;
const verifyToken = getVal('WHATSAPP_WEBHOOK_VERIFY_TOKEN') || 'flowdesk_secret_verify_2026';
const port = 5000;

async function updateMetaSubscription(tunnelUrl) {
  const callbackUrl = `${tunnelUrl}/api/v1/webhooks/whatsapp`;
  console.log(`[TunnelSync] Syncing Meta Webhook subscription to: ${callbackUrl}`);

  const url = `https://graph.facebook.com/v21.0/${appId}/subscriptions`;
  const params = new URLSearchParams({
    object: 'whatsapp_business_account',
    callback_url: callbackUrl,
    fields: 'messages',
    verify_token: verifyToken,
    access_token: appAccessToken
  });

  try {
    const res = await fetch(url, { method: 'POST', body: params });
    const data = await res.json();
    if (data.success) {
      console.log(`[TunnelSync] ✅ Meta Webhook Subscribed Successfully to: ${callbackUrl}`);
    } else {
      console.error(`[TunnelSync] ⚠️ Meta Subscription response:`, data);
    }
  } catch (err) {
    console.error(`[TunnelSync] ❌ Meta subscription error:`, err.message);
  }
}

async function startTunnel() {
  console.log(`[TunnelSync] Starting localtunnel on port ${port}...`);
  try {
    const tunnel = await localtunnel({ port });
    console.log(`[TunnelSync] 🌐 Public Tunnel URL: ${tunnel.url}`);

    await updateMetaSubscription(tunnel.url);

    tunnel.on('close', () => {
      console.warn(`[TunnelSync] Tunnel closed. Reconnecting in 3 seconds...`);
      setTimeout(startTunnel, 3000);
    });

    tunnel.on('error', (err) => {
      console.error(`[TunnelSync] Tunnel error:`, err.message);
      try {
        tunnel.close();
      } catch {}
    });
  } catch (err) {
    console.error(`[TunnelSync] Failed to establish tunnel:`, err.message);
    setTimeout(startTunnel, 5000);
  }
}

startTunnel();

