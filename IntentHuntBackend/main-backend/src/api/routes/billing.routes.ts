/**
 * Billing routes — Dodo Payments integration.
 *
 * Endpoints:
 *   POST /webhook          — receives Dodo events (Standard Webhooks signed, idempotent)
 *   POST /checkout         — creates a subscription checkout, returns hosted-checkout URL
 *   GET  /subscription     — returns the authenticated user's subscription state
 *   POST /portal-session   — generates Dodo Customer Portal URL for managing/canceling
 *   GET  /config           — exposes APP_URL and DODO_MODE for the frontend
 *
 * Note on the webhook: it MUST NOT use the global JSON body parser.
 * Standard Webhooks signs the raw bytes; if we parse to JSON first the
 * signature verification fails. The route uses a raw-string content
 * type parser registered below.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { prisma } from '../../db/prisma.client.js';
import { logger } from '../../utils/logger.js';
import { env } from '../../config/env.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import {
  verifyWebhook,
  createSubscriptionCheckout,
  createCustomerPortalSession,
} from '../../services/dodo.client.js';
import { dispatchDodoEvent } from '../../services/dodo-events.handler.js';

export async function billingRoutes(app: FastifyInstance) {
  // ── Raw body parser for the webhook route ─────────────────────────
  // Default Fastify JSON parser would mangle the body. We capture raw
  // bytes for application/json so signature verification has the exact
  // payload Dodo signed.
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (req, body, done) => {
      (req as FastifyRequest & { rawBody?: string }).rawBody = body as string;
      try {
        const parsed = body ? JSON.parse(body as string) : {};
        done(null, parsed);
      } catch (err) {
        done(err as Error, undefined);
      }
    },
  );

  // ── Webhook (PUBLIC — signature verification, no Bearer token) ────
  app.post('/webhook', async (request, reply) => {
    const webhookId        = request.headers['webhook-id'];
    const webhookTimestamp = request.headers['webhook-timestamp'];
    const webhookSignature = request.headers['webhook-signature'];
    const rawBody          = (request as FastifyRequest & { rawBody?: string }).rawBody;

    if (
      typeof webhookId        !== 'string' ||
      typeof webhookTimestamp !== 'string' ||
      typeof webhookSignature !== 'string' ||
      !rawBody
    ) {
      logger.warn(
        { hasId: !!webhookId, hasTs: !!webhookTimestamp, hasSig: !!webhookSignature, hasBody: !!rawBody },
        '[dodo] webhook missing signature headers/body',
      );
      return reply.code(400).send({ error: 'Missing signature headers or body' });
    }

    let event;
    try {
      event = verifyWebhook(rawBody, {
        'webhook-id':        webhookId,
        'webhook-timestamp': webhookTimestamp,
        'webhook-signature': webhookSignature,
      });
    } catch (err) {
      logger.error({ err }, '[dodo] webhook signature verification failed');
      return reply.code(401).send({ error: 'Invalid signature' });
    }

    // Idempotency — Dodo (via Svix) retries until it gets a 2xx.
    // The `webhook-id` header is the unique event id we store.
    const existing = await prisma.dodoEvent.findUnique({ where: { id: webhookId } });
    if (existing) {
      logger.debug({ eventId: webhookId }, '[dodo] webhook duplicate — already processed');
      return reply.code(200).send({ status: 'duplicate' });
    }

    try {
      await dispatchDodoEvent(event);
      await prisma.dodoEvent.create({
        data: {
          id:        webhookId,
          eventType: event.type,
          payload:   event as unknown as object,
        },
      });
      return reply.code(200).send({ status: 'ok' });
    } catch (err) {
      logger.error({ err, eventId: webhookId, eventType: event.type }, '[dodo] event handler threw');
      return reply.code(500).send({ error: 'Handler failed' });
    }
  });

  // ── Authenticated routes from here on ────────────────────────────
  app.addHook('preHandler', async (request, reply) => {
    // Skip auth for the webhook (it authenticates via signature, not Bearer).
    if (request.url.endsWith('/webhook')) return;
    return authMiddleware(request, reply);
  });

  // POST /checkout — create a hosted-checkout URL for a product
  app.post('/checkout', async (request, reply) => {
    if (!request.userId) return reply.code(401).send({ error: 'Unauthenticated' });

    const body = request.body as { productId?: string } | undefined;
    const productId = body?.productId;
    if (!productId || typeof productId !== 'string') {
      return reply.code(400).send({ error: 'productId is required' });
    }

    const profile = await prisma.profile.findUnique({
      where:  { id: request.userId },
      select: { email: true, name: true },
    });
    if (!profile) return reply.code(404).send({ error: 'Profile not found' });

    try {
      const { paymentLink } = await createSubscriptionCheckout({
        productId,
        customerEmail: profile.email,
        customerName:  profile.name ?? undefined,
        returnUrl:     `${env.APP_URL}/dashboard?upgraded=1`,
      });
      return reply.send({ url: paymentLink });
    } catch (err) {
      logger.error({ err, userId: request.userId, productId }, '[dodo] failed to create checkout');
      return reply.code(500).send({ error: 'Failed to create checkout' });
    }
  });

  app.get('/subscription', async (request, reply) => {
    if (!request.userId) return reply.code(401).send({ error: 'Unauthenticated' });

    const profile = await prisma.profile.findUnique({
      where:  { id: request.userId },
      select: {
        plan: true,
        planStatus: true,
        billingInterval: true,
        trialEndsAt: true,
        currentPeriodEnd: true,
        cancelAtPeriodEnd: true,
        dodoSubscriptionId: true,
      },
    });

    if (!profile) return reply.code(404).send({ error: 'Profile not found' });

    return reply.send({ subscription: profile });
  });

  app.post('/portal-session', async (request, reply) => {
    if (!request.userId) return reply.code(401).send({ error: 'Unauthenticated' });

    const profile = await prisma.profile.findUnique({
      where:  { id: request.userId },
      select: { dodoCustomerId: true },
    });

    if (!profile?.dodoCustomerId) {
      return reply.code(400).send({
        error: 'No Dodo customer linked. Subscribe to a plan first.',
      });
    }

    try {
      const url = await createCustomerPortalSession(profile.dodoCustomerId);
      return reply.send({ url });
    } catch (err) {
      logger.error({ err, userId: request.userId }, '[dodo] failed to create portal session');
      return reply.code(500).send({ error: 'Failed to create portal session' });
    }
  });

  // GET /config — frontend uses this to know which env is live.
  app.get('/config', async (_request, reply) => {
    return reply.send({
      dodoMode: env.DODO_MODE,
      appUrl:   env.APP_URL,
    });
  });
}
