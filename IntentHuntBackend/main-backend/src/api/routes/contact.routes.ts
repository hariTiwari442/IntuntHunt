import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../db/prisma.client.js";

// ── Schema ──────────────────────────────────────────────────────
//
// `website` is a honeypot: a field real visitors never see or fill (hidden
// off-screen on the frontend), but form-filling bots routinely populate every
// input they find. If it arrives non-empty we pretend to succeed without
// writing anything — no CAPTCHA, no new dependency, catches the dumb bots
// that account for most spam on an unauthenticated endpoint like this.

const ContactSchema = z.object({
  name:    z.string().trim().max(100).optional(),
  email:   z.string().trim().email("Invalid email"),
  message: z.string().trim().min(10, "Message is too short").max(5000),
  website: z.string().optional(), // honeypot — any non-empty value means "bot"
});

// ── Routes ──────────────────────────────────────────────────────
//
// Public and unauthenticated on purpose — a logged-out visitor should be
// able to reach out same as anyone else. No transactional email provider is
// configured yet (only Supabase's own auth emails exist), so this does not
// send anything — it just stores the message. Check the contact_messages
// table for new submissions until/unless email delivery gets wired up.

export async function contactRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    "/",
    {
      // Tighter than the global 100/min: a contact form has no legitimate
      // reason to be hit more than a few times an hour by the same visitor.
      config: { rateLimit: { max: 5, timeWindow: "1 hour" } },
    },
    async (request, reply) => {
      const body = ContactSchema.parse(request.body);

      if (body.website) {
        // Honeypot tripped — report success, store nothing.
        reply.status(201).send({ message: "Thanks — we'll get back to you soon." });
        return;
      }

      await prisma.contactMessage.create({
        data: {
          name:      body.name || null,
          email:     body.email,
          message:   body.message,
          ipAddress: request.ip,
        },
      });

      reply.status(201).send({ message: "Thanks — we'll get back to you soon." });
    },
  );
}
