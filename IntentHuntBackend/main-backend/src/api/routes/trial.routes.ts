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

// These ceilings exist to stop a stranger burning credits on the public
// homepage. Locally there are no credits at stake (see MOCK_PIPELINE) and the
// production limits make it impossible to click through the flow more than
// three times, so they're relaxed outside production.
const isProd = env.NODE_ENV === 'production';
const ANALYZE_LIMIT = isProd ? 10 : 1000;
const SCAN_LIMIT    = isProd ? 3  : 1000;

export async function trialRoutes(app: FastifyInstance): Promise<void> {
  // POST /trial/analyze — extract a product URL and derive its description.
  //
  // Rate limited well below the global 100/min: each miss costs a gpt-4o
  // call. Repeat hits on an already-analysed URL are served from cache by
  // crawler-service, so this ceiling only really binds on someone feeding us
  // a stream of *distinct* URLs.
  app.post(
    '/analyze',
    { config: { rateLimit: { max: ANALYZE_LIMIT, timeWindow: '1 hour' } } },
    async (request, reply) => proxyPublic(request, reply, '/api/v1/trial/analyze'),
  );

  // POST /trial/:scanId/scan — the "find conversations" click.
  //
  // This is the expensive one: keyword engine + a full lead search. Held to a
  // tighter ceiling than /analyze because each call spends Serper,
  // ScrapeCreators and OpenAI credits.
  app.post(
    '/:scanId/scan',
    { config: { rateLimit: { max: SCAN_LIMIT, timeWindow: '1 hour' } } },
    async (request, reply) => {
      const { scanId } = request.params as { scanId: string };
      return proxyPublic(request, reply, `/api/v1/trial/${encodeURIComponent(scanId)}/scan`);
    },
  );

  // GET /trial/:scanId — re-read a scan (page refresh, returning visitor).
  app.get('/:scanId', async (request, reply) => {
    const { scanId } = request.params as { scanId: string };
    return proxyPublic(request, reply, `/api/v1/trial/${encodeURIComponent(scanId)}`);
  });
}
