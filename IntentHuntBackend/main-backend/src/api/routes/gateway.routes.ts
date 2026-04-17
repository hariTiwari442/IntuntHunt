import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { request as undiciRequest } from 'undici';
import { env } from '../../config/env.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { prisma } from '../../db/prisma.client.js';
import { logger } from '../../utils/logger.js';
import { NotFoundError, ForbiddenError } from '../../utils/errors.js';

/**
 * Gateway routes proxy authenticated requests to internal microservices.
 * Strips the Authorization header and forwards X-User-Id instead.
 */
export async function gatewayRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  // ── Keyword Service ─────────────────────────────────
  // Generates keywords via AI and saves the result to the products table.
  app.post('/keywords/generate', async (request, reply) => {
    const url = `${env.KEYWORD_SERVICE_URL}/api/v1/keywords/generate`;

    const { statusCode, body } = await undiciRequest(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-user-id': request.userId },
      body: JSON.stringify(request.body),
    });

    const responseText = await body.text();

    if (statusCode !== 200) {
      reply.status(statusCode).send(responseText);
      return;
    }

    const result = JSON.parse(responseText) as {
      intelligence: Record<string, unknown>;
      queries: { redditGlobal: string[]; redditSubreddit: string[]; hackernews: string[]; linkedin: string[] };
      subreddits: string[];
    };

    // Save to products table
    const reqBody = request.body as { name: string; description: string };
    const product = await prisma.product.create({
      data: {
        userId:       request.userId,
        name:         reqBody.name,
        description:  reqBody.description,
        intelligence: result.intelligence as any,
        queries:      result.queries as any,
        subreddits:   result.subreddits,
      },
    });

    logger.info({ productId: product.id, userId: request.userId }, 'Product keywords saved');

    reply.status(200).send({ ...result, productId: product.id });
  });

  // ── Products ─────────────────────────────────────────
  app.get('/products', async (request, reply) => {
    const products = await prisma.product.findMany({
      where:   { userId: request.userId },
      select:  { id: true, name: true, description: true, queries: true, subreddits: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
    reply.send({ products });
  });

  // Delete a product and all associated crawl jobs (posts/tasks cascade in crawler DB)
  app.delete('/products/:productId', async (request, reply) => {
    const { productId } = request.params as { productId: string };

    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new NotFoundError('Product', productId);
    if (product.userId !== request.userId) throw new ForbiddenError();

    // Find all crawl jobs linked to this product
    const jobs = await prisma.crawlJob.findMany({
      where: { productId },
      select: { id: true },
    });
    const jobIds = jobs.map(j => j.id);

    // Delete posts & tasks in crawler DB (cascade from crawl_jobs)
    if (jobIds.length > 0) {
      const deleteUrl = `${env.CRAWLER_SERVICE_URL}/api/v1/jobs`;
      for (const jobId of jobIds) {
        await undiciRequest(`${deleteUrl}/${jobId}`, {
          method: 'DELETE',
          headers: { 'content-type': 'application/json', 'x-user-id': request.userId },
        }).catch(err => {
          logger.warn({ err, jobId }, 'Failed to delete crawler job');
        });
      }
    }

    // Delete crawl jobs from main-backend DB
    await prisma.crawlJob.deleteMany({ where: { productId } });

    // Delete the product itself
    await prisma.product.delete({ where: { id: productId } });

    logger.info({ productId, jobsDeleted: jobIds.length }, 'Product and associated data deleted');
    reply.send({ message: 'Product deleted', productId, jobsDeleted: jobIds.length });
  });

  // ── Crawler Service ─────────────────────────────────

  // Create a crawl job — stores query payload in metadata for recrawl.
  app.post('/crawl/jobs', async (request, reply) => {
    const url = `${env.CRAWLER_SERVICE_URL}/api/v1/jobs`;
    logger.info({ body: request.body }, 'POST /crawl/jobs received body');
    const reqBody = request.body as {
      queries: { redditGlobal: string[]; redditSubreddit: string[]; hackernews: string[]; linkedin: string[] };
      subreddits: string[];
      productId?: string;
    };

    const { statusCode, body } = await undiciRequest(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-user-id': request.userId },
      body: JSON.stringify(reqBody),
    });

    const responseText = await body.text();

    if (statusCode === 202) {
      const crawlerResponse = JSON.parse(responseText) as { jobId: string };

      // Upsert job reference — crawler-service may have already created the record
      const keywords = [
        ...new Set([
          ...(reqBody.queries.redditGlobal    ?? []),
          ...(reqBody.queries.redditSubreddit ?? []),
          ...(reqBody.queries.hackernews      ?? []),
          ...(reqBody.queries.linkedin        ?? []),
        ]),
      ];
      const sources: ('reddit' | 'hackernews' | 'linkedin')[] = [
        ...(((reqBody.queries.redditGlobal ?? []).length > 0 || (reqBody.queries.redditSubreddit ?? []).length > 0) ? ['reddit' as const] : []),
        ...((reqBody.queries.hackernews ?? []).length > 0 ? ['hackernews' as const] : []),
        ...((reqBody.queries.linkedin   ?? []).length > 0 ? ['linkedin'   as const] : []),
      ];
      const metadata = { queries: reqBody.queries, subreddits: reqBody.subreddits ?? [] };

      await prisma.crawlJob.upsert({
        where:  { id: crawlerResponse.jobId },
        create: {
          id:        crawlerResponse.jobId,
          userId:    request.userId,
          productId: reqBody.productId ?? null,
          keywords,
          sources,
          metadata,
        },
        update: {
          productId: reqBody.productId ?? null,
          keywords,
          sources,
          metadata,
        },
      }).catch(err => {
        logger.warn({ err, jobId: crawlerResponse.jobId }, 'Failed to upsert job reference in main-backend');
      });
    }

    reply.status(statusCode).send(responseText);
  });

  app.get('/crawl/jobs', async (request, reply) => {
    const qs = new URLSearchParams(request.query as Record<string, string>).toString();
    const path = `/api/v1/jobs${qs ? `?${qs}` : ''}`;

    const { statusCode, headers, body } = await undiciRequest(`${env.CRAWLER_SERVICE_URL}${path}`, {
      method: 'GET',
      headers: { 'content-type': 'application/json', 'x-user-id': request.userId },
    });

    const responseText = await body.text();

    if (statusCode !== 200) {
      reply.status(statusCode).header('content-type', headers['content-type'] ?? 'application/json').send(responseText);
      return;
    }

    const crawlerResponse = JSON.parse(responseText) as {
      jobs: Array<{ jobId: string;[key: string]: unknown }>;
      total: number; page: number; limit: number;
    };

    // Enrich each job with productId from main-backend DB
    const jobIds = crawlerResponse.jobs.map(j => j.jobId);
    const localJobs = await prisma.crawlJob.findMany({
      where: { id: { in: jobIds } },
      select: { id: true, productId: true },
    });

    const productIdMap = new Map(localJobs.map(j => [j.id, j.productId]));

    const enriched = {
      ...crawlerResponse,
      jobs: crawlerResponse.jobs.map(j => ({
        ...j,
        productId: productIdMap.get(j.jobId) ?? null,
      })),
    };

    reply.status(200).send(enriched);
  });

  app.get('/crawl/jobs/:jobId', async (request, reply) => {
    const { jobId } = request.params as { jobId: string };
    return proxy(request, reply, env.CRAWLER_SERVICE_URL, `/api/v1/jobs/${jobId}`);
  });

  app.get('/crawl/jobs/:jobId/posts', async (request, reply) => {
    const { jobId } = request.params as { jobId: string };
    const qs = new URLSearchParams({ jobId, ...(request.query as Record<string, string>) }).toString();
    return proxy(request, reply, env.CRAWLER_SERVICE_URL, `/api/v1/posts?${qs}`);
  });

  // ── Recrawl — reuse saved query payload from original job ────────────────
  app.post('/crawl/jobs/:jobId/recrawl', async (request, reply) => {
    const { jobId } = request.params as { jobId: string };

    const job = await prisma.crawlJob.findUnique({ where: { id: jobId } });
    if (!job) throw new NotFoundError('CrawlJob', jobId);
    if (job.userId !== request.userId) throw new ForbiddenError();

    const meta = job.metadata as { queries?: Record<string, string[]>; subreddits?: string[] };
    if (!meta.queries) {
      reply.status(400).send({
        statusCode: 400,
        error: 'BAD_REQUEST',
        message: 'Original job has no saved query payload — cannot recrawl',
      });
      return;
    }

    // Create new crawl job with same queries
    const url = `${env.CRAWLER_SERVICE_URL}/api/v1/jobs`;
    const { statusCode, body } = await undiciRequest(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-user-id': request.userId },
      body: JSON.stringify({ queries: meta.queries, subreddits: meta.subreddits ?? [] }),
    });

    const responseText = await body.text();

    if (statusCode === 202) {
      const crawlerResponse = JSON.parse(responseText) as { jobId: string };

      await prisma.crawlJob.create({
        data: {
          id:        crawlerResponse.jobId,
          userId:    request.userId,
          productId: job.productId ?? null,
          keywords:  job.keywords,
          sources:   job.sources,
          metadata:  { queries: meta.queries, subreddits: meta.subreddits ?? [] },
        },
      }).catch(err => {
        logger.warn({ err, jobId: crawlerResponse.jobId }, 'Failed to save recrawl job reference');
      });
    }

    reply.status(statusCode).send(responseText);
  });
}

// ── Proxy helper ────────────────────────────────────────

async function proxy(
  request: FastifyRequest,
  reply: FastifyReply,
  baseUrl: string,
  path: string,
): Promise<void> {
  const url = `${baseUrl}${path}`;

  try {
    const { statusCode, headers, body } = await undiciRequest(url, {
      method: request.method as 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
      headers: {
        'content-type': 'application/json',
        'x-user-id':    request.userId,
      },
      body: request.method !== 'GET' ? JSON.stringify(request.body) : null,
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
