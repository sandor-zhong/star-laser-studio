// Douyin currently shares both stand-alone live links and root/live links.
// Read only the path ID; anchor_id and other numeric query values are unrelated.
export function extractRoomInput(value) {
  const text = String(value ?? '').trim();
  if (!text || /^\d+$/.test(text)) return text;
  try {
    const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    const host = url.hostname.toLowerCase();
    const match = host === 'live.douyin.com' ? url.pathname.match(/^\/(\d+)\/?$/)
      : ['www.douyin.com', 'douyin.com'].includes(host) ? url.pathname.match(/^\/root\/live\/(\d+)\/?$/) : null;
    return match ? match[1] : text;
  } catch { return text; }
}
