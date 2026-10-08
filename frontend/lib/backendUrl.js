import fs from 'fs';
import path from 'path';

let cachedUrl = null;

function cleanUrl(raw) {
  return raw.replace(/\/api\/?$/, '').replace(/\/+$/, '');
}

/** Backend base URL for server-side proxy (no /api suffix). */
export function getBackendBaseUrl() {
  if (cachedUrl) return cachedUrl;

  if (process.env.BACKEND_URL) {
    cachedUrl = cleanUrl(process.env.BACKEND_URL);
    return cachedUrl;
  }

  if (process.env.NEXT_PUBLIC_API_URL) {
    cachedUrl = cleanUrl(process.env.NEXT_PUBLIC_API_URL);
    return cachedUrl;
  }

  // FTP-friendly: upload backend-url.txt with one line, e.g. https://api.yoursite.com
  try {
    const filePath = path.join(process.cwd(), 'backend-url.txt');
    const fromFile = fs.readFileSync(filePath, 'utf8').trim();
    if (fromFile && !fromFile.startsWith('#')) {
      cachedUrl = cleanUrl(fromFile.split('\n')[0].trim());
      return cachedUrl;
    }
  } catch {
    // optional file — same-server default below
  }

  // Default: backend on the same machine (typical FTP/VPS setup)
  cachedUrl = 'http://127.0.0.1:5000';
  return cachedUrl;
}
