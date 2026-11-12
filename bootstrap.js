// A static server keeps the original offline demo; the studio service owns
// real events, queue and configuration across browsers and OBS.
const params = new URLSearchParams(location.search);
if (location.pathname === '/live' || location.pathname === '/live/') document.body.classList.add('live-mode');
let server = null;
if (!params.has('demo')) {
  try {
    const response = await fetch('/api/state', { signal: AbortSignal.timeout(3000), cache: 'no-store' });
    if (response.ok) {
      const value = await response.json();
      if (value?.config && Array.isArray(value.queue)) server = value;
    }
  } catch { /* Offline previews still work without the studio service. */ }
}
if (server) {
  const { startStudioClient } = await import('./studio-client.js?v=finished4');
  await startStudioClient(server);
} else await import('./main.js?v=finished4');
