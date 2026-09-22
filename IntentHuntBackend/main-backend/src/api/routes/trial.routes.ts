import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { request as undiciRequest } from 'undici';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';

/**
 * Public (unauthenticated) trial-scan routes for the homepage funnel.
 *
 * Deliberately NOT in gateway.routes.ts: that file installs
 * `preHandler: authMiddleware` on every route, and the entire point here is
 * that the visitor has no account yet.
 *
 * These proxy to crawler-service, which owns the pipeline. No `x-user-id` is
 * forwarded — there isn't one — so crawler-service must not assume a user on
 * these paths.
 */

async function proxyPublic(
  request: FastifyRequest,
  reply:   FastifyReply,
  path:    string,
): Promise<void> {
  const url = `${env.CRAWLER_SERVICE_URL}${path}`;
  try {
    const { statusCode, headers, body } = await undiciRequest(url, {
      method: request.method as 'GET' | 'POST',
      headers: {
        'content-type':   'application/json',
        'x-internal-key': env.INTERNAL_SERVICE_KEY,
      },
      body: request.method !== 'GET' ? JSON.stringify(request.body ?? {}) : null,
    });

    const responseBody = await body.text();
    reply
      .status(statusCode)
      .header('content-type', headers['content-type'] ?? 'application/json')
      .send(responseBody);
  } catch (err) {
    logger.error({ err, url }, 'Trial proxy failed');
    reply.status(502).send({
      statusCode: 502,
      error:      'BAD_GATEWAY',
      message:    'Downstream service unavailable',
    });
  }
}

export async function trialRoutes(app: FastifyInstance): Promise<void> {
  // POST /trial/analyze — extract a product URL and derive its description.
  //
  // Rate limited well below the global 100/min: each miss costs a gpt-4o
  // call. Repeat hits on an already-analysed URL are served from cache by
  // crawler-service, so this ceiling only really binds on someone feeding us
  // a stream of *distinct* URLs.
  app.post(
    '/analyze',
    { config: { rateLimit: { max: 10, timeWindow: '1 hour' } } },
    async (request, reply) => proxyPublic(request, reply, '/api/v1/trial/analyze'),
  );

  // GET /trial/:scanId — re-read a scan (page refresh, returning visitor).
  app.get('/:scanId', async (request, reply) => {
    const { scanId } = request.params as { scanId: string };
    return proxyPublic(request, reply, `/api/v1/trial/${encodeURIComponent(scanId)}`);
  });
}
