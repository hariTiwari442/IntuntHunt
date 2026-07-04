import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { request as undiciRequest } from 'undici';
import { env } from '../../config/env.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { prisma } from '../../db/prisma.client.js';
import { logger } from '../../utils/logger.js';
import { NotFoundError, ForbiddenError } from '../../utils/errors.js';
import { canCreateProduct } from '../../services/plan-enforcement.js';

/**
 * Gateway — proxies authenticated requests to crawler-service (the lead engine).
 *
 * Auth: this layer verifies the Bearer token, then forwards X-User-Id to
 * crawler-service which trusts the gateway.
 *
 * Endpoints:
 *   POST   /products                                  create product (no AI call)
 *   GET    /products                                  list user's products
 *   GET    /products/:productId                       get one product
 *   PATCH  /products/:productId                       edit (clears AI cache on description change)
 *   DELETE /products/:productId                       delete + cascade leads
 *   POST   /products/:productId/find-leads            kick off pipeline (async)
 *   GET    /search-runs/:searchRunId                  poll pipeline status (fallback to Realtime)
 *   GET    /products/:productId/leads                 list leads for a product
 */
export async function gatewayRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  // ── Products CRUD ───────────────────────────────────────────────────────

  // POST /products — create a product row (empty intelligence/queries; AI runs on first find-leads)
  app.post('/products', async (request, reply) => {
    const body = request.body as { name?: string; description: string; productUrl?: string };

    if (!body.description || body.description.trim().length === 0) {
      reply.status(400).send({
        statusCode: 400,
        error: 'BAD_REQUEST',
        message: 'description is required',
      });
      return;
    }

    // ── Plan enforcement ──────────────────────────────────────────────────
    // Server-side check: confirm the user's plan + status allows another product.
    // The frontend should also gate this, but never trust the client alone.
    const check = await canCreateProduct(request.userId);
    if (!check.allowed) {
      return reply.status(402).send({
        statusCode: 402,
        error: 'PAYMENT_REQUIRED',
        message: check.reason,
        ...(check.limit !== undefined ? { limit: check.limit, current: check.current, plan: check.plan } : {}),
      });
    }

    const product = await prisma.product.create({
      data: {
        userId:       request.userId,
        name:         body.name ?? '',
        description:  body.description,
        productUrl:   body.productUrl ?? null,
        intelligence: {},
        queries:      {},
        subreddits:   [],
      },
    });

    logger.info({ productId: product.id, userId: request.userId }, 'Product created');
    reply.status(201).send(product);
  });

  // GET /products  (includes leadCount per product)
  app.get('/products', async (request, reply) => {
    const products = await prisma.product.findMany({
      where:   { userId: request.userId },
      select:  {
        id: true, name: true, description: true, productUrl: true,
        intelligence: true, queries: true, subreddits: true,
        lastSearchedAt: true, createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (products.length === 0) {
      return reply.send({ products: [] });
    }

    // Bulk-count leads per product in a single SQL roundtrip.
    // Also count leads created in the last 24h (the "new" badge on the UI).
    // The `leads` table is owned by crawler-service but shares the same DB,
    // so we read it via raw SQL rather than adding the model to this schema.
    const productIds = products.map(p => p.id);
    const counts = await prisma.$queryRaw<Array<{
      product_id: string;
      total: number;
      new_24h: number;
    }>>`
      SELECT
        product_id::text AS product_id,
        COUNT(*)::int     AS total,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours')::int AS new_24h
      FROM leads
      WHERE product_id = ANY(${productIds}::uuid[])
      GROUP BY product_id
    `;
    const countMap = new Map(
      counts.map(c => [c.product_id, { total: Number(c.total), new24h: Number(c.new_24h) }]),
    );

    const productsWithCounts = products.map(p => {
      const c = countMap.get(p.id);
      return {
        ...p,
        leadCount:    c?.total  ?? 0,
        newLeadCount: c?.new24h ?? 0,
      };
    });

    reply.send({ products: productsWithCounts });
  });

  // GET /products/:productId
  app.get('/products/:productId', async (request, reply) => {
    const { productId } = request.params as { productId: string };
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new NotFoundError('Product', productId);
    if (product.userId !== request.userId) throw new ForbiddenError();
    reply.send(product);
  });

  // PATCH /products/:productId
  app.patch('/products/:productId', async (request, reply) => {
    const { productId } = request.params as { productId: string };
    const body = request.body as {
      name?:         string;
      description?:  string;
      productUrl?:   string | null;
      queries?:      Record<string, unknown>;
      subreddits?:   string[];
    };

    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new NotFoundError('Product', productId);
    if (product.userId !== request.userId) throw new ForbiddenError();

    // If the user changed the description, clear cached AI output so next
    // find-leads re-runs Step 1 on the new description.
    const descriptionChanged = body.description !== undefined && body.description !== product.description;

    const updated = await prisma.product.update({
      where: { id: productId },
      data: {
        ...(body.name        !== undefined ? { name: body.name }               : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.productUrl  !== undefined ? { productUrl: body.productUrl }   : {}),
        ...(body.queries     !== undefined ? { queries: body.queries as any }  : {}),
        ...(body.subreddits  !== undefined ? { subreddits: body.subreddits }   : {}),
        ...(descriptionChanged ? { intelligence: {} as any, queries: {} as any } : {}),
      },
    });

    reply.send(updated);
  });

  // DELETE /products/:productId — cascade deletes search_runs + leads via FK
  app.delete('/products/:productId', async (request, reply) => {
    const { productId } = request.params as { productId: string };
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new NotFoundError('Product', productId);
    if (product.userId !== request.userId) throw new ForbiddenError();

    // Cascade in crawler DB (search_runs → leads via Lead.searchRun onDelete:Cascade,
    // search_runs is referenced by productId but no FK there — clean manually).
    await prisma.$transaction([
      // Delete leads (no FK to product directly in main-backend's schema, but
      // crawler-service models them — they cascade from search_runs)
      // Just delete the product; main-backend has no Lead model, crawler-service handles.
      prisma.product.delete({ where: { id: productId } }),
    ]);

    // Notify crawler-service to clean its tables
    await undiciRequest(`${env.CRAWLER_SERVICE_URL}/api/v1/products/${productId}/cleanup`, {
      method:  'POST',
      headers: { 'content-type': 'application/json', 'x-user-id': request.userId },
    }).catch((err) => logger.warn({ err, productId }, 'Crawler cleanup failed (non-fatal)'));

    reply.send({ message: 'Product deleted', productId });
  });

  // ── Lead Engine ─────────────────────────────────────────────────────────

  // POST /products/:productId/find-leads
  app.post('/products/:productId/find-leads', async (request, reply) => {
    const { productId } = request.params as { productId: string };
    return proxy(request, reply, env.CRAWLER_SERVICE_URL, `/api/v1/find-leads/${productId}`);
  });

  // GET /search-runs/:searchRunId
  app.get('/search-runs/:searchRunId', async (request, reply) => {
    const { searchRunId } = request.params as { searchRunId: string };
    return proxy(request, reply, env.CRAWLER_SERVICE_URL, `/api/v1/search-runs/${searchRunId}`);
  });

  // PATCH /leads/:leadId — update tags, viewed flag, status
  app.patch('/leads/:leadId', async (request, reply) => {
    const { leadId } = request.params as { leadId: string };
    return proxy(request, reply, env.CRAWLER_SERVICE_URL, `/api/v1/leads/${leadId}`);
  });

  // GET /products/:productId/leads
  app.get('/products/:productId/leads', async (request, reply) => {
    const { productId } = request.params as { productId: string };
    const queryString = new URLSearchParams({
      productId,
      ...(request.query as Record<string, string>),
    }).toString();
    return proxy(request, reply, env.CRAWLER_SERVICE_URL, `/api/v1/leads?${queryString}`);
  });
}

// ── Proxy helper ────────────────────────────────────────────────────────────

async function proxy(
  request: FastifyRequest,
  reply:   FastifyReply,
  baseUrl: string,
  path:    string,
): Promise<void> {
  const url = `${baseUrl}${path}`;
  try {
    const { statusCode, headers, body } = await undiciRequest(url, {
      method: request.method as 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
      headers: {
        'content-type': 'application/json',
        'x-user-id':    request.userId,
      },
      body: request.method !== 'GET' ? JSON.stringify(request.body ?? {}) : null,
    });

    const responseBody = await body.text();
    reply
      .status(statusCode)
      .header('content-type', headers['content-type'] ?? 'application/json')
      .send(responseBody);
  } catch (err) {
    logger.error({ err, url }, 'Gateway proxy failed');
    reply.status(502).send({
      statusCode: 502,
      error:      'BAD_GATEWAY',
      message:    'Downstream service unavailable',
    });
  }
}
