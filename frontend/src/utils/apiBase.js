const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

function trimTrailingSlash(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function formatHostname(hostname) {
  if (!hostname) return 'localhost';
  return hostname.includes(':') && !hostname.startsWith('[') ? `[${hostname}]` : hostname;
}

function normalizeOrigin(value) {
  const raw = trimTrailingSlash(value);
  if (!raw) return '';
  try {
    const url = new URL(raw);
    url.pathname = url.pathname.replace(/\/api\/?$/, '') || '/';
    url.search = '';
    url.hash = '';
    return trimTrailingSlash(url.toString());
  } catch {
    return raw.replace(/\/api\/?$/, '');
  }
}

export function getDefaultApiOrigin() {
  if (typeof window !== 'undefined' && window.location) {
    const { protocol, hostname, origin } = window.location;
    if (LOCAL_HOSTS.has(hostname)) {
      const apiPort = import.meta.env.VITE_API_PORT || '4000';
      return `${protocol}//${formatHostname(hostname)}:${apiPort}`;
    }
    if (hostname === 'peerprep.co.in') return 'https://peerprep.co.in';
    return trimTrailingSlash(origin);
  }

  return 'http://localhost:4000';
}

export function getApiBase() {
  const explicitBase = trimTrailingSlash(import.meta.env.VITE_API_BASE);
  if (explicitBase) return explicitBase;

  const explicitOrigin = normalizeOrigin(import.meta.env.VITE_API_URL);
  if (explicitOrigin) return `${explicitOrigin}/api`;

  return `${getDefaultApiOrigin()}/api`;
}

export function getSocketBase() {
  const explicitSocket = normalizeOrigin(import.meta.env.VITE_SOCKET_URL);
  if (explicitSocket) return explicitSocket;

  const explicitApiOrigin = normalizeOrigin(import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE);
  if (explicitApiOrigin) return explicitApiOrigin;

  return getDefaultApiOrigin();
}
