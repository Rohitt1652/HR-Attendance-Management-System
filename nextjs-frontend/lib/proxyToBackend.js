import { getBackendBaseUrl } from './backendUrl';

const FORWARD_REQUEST_HEADERS = ['authorization', 'content-type', 'accept', 'cookie'];
const FORWARD_RESPONSE_HEADERS = ['content-type', 'content-disposition', 'cache-control'];

function buildForwardHeaders(request) {
  const headers = new Headers();
  FORWARD_REQUEST_HEADERS.forEach((name) => {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  });
  return headers;
}

function buildResponseHeaders(upstream) {
  const headers = new Headers();
  FORWARD_RESPONSE_HEADERS.forEach((name) => {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  });
  return headers;
}

/** Proxy to Express without forwarding Origin — avoids browser CORS entirely. */
export async function proxyToBackend(request, { pathPrefix, pathSegments = [] }) {
  const backendBase = getBackendBaseUrl();
  const joinedPath = pathSegments.filter(Boolean).join('/');
  const targetPath = joinedPath ? `${pathPrefix}/${joinedPath}` : pathPrefix;
  const url = new URL(`${targetPath}${request.nextUrl.search}`, backendBase);

  const init = {
    method: request.method,
    headers: buildForwardHeaders(request),
    redirect: 'manual',
  };

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = await request.arrayBuffer();
  }

  const upstream = await fetch(url, init);
  return new Response(await upstream.arrayBuffer(), {
    status: upstream.status,
    headers: buildResponseHeaders(upstream),
  });
}
