import { proxyToBackend } from '@/lib/proxyToBackend';

async function handler(request, context) {
  const params = await context.params;
  return proxyToBackend(request, {
    pathPrefix: '/api',
    pathSegments: params.path,
  });
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const OPTIONS = handler;
