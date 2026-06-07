import type { FastifyInstance } from "fastify";
import { z } from "zod";
import * as authService from "../../services/auth.service.js";
import { authMiddleware } from "../middleware/auth.middleware.js";

// ── Schemas ─────────────────────────────────────────────

const SignupSchema = z.object({
  email: z.string().email("Invalid email"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Must contain an uppercase letter")
    .regex(/[0-9]/, "Must contain a number"),
  name: z.string().max(100).optional(),
});

const LoginSchema = z.object({
  email: z.string().email("Invalid email"),
  password: z.string().min(1, "Password is required"),
});

const MagicCallbackSchema = z.object({
  accessToken:  z.string().min(1, "accessToken is required"),
  refreshToken: z.string().min(1, "refreshToken is required"),
});

const ForgotPasswordSchema = z.object({
  email: z.string().email("Invalid email"),
});

const ResetPasswordSchema = z.object({
  accessToken: z.string().min(1, "Reset token is required"),
  newPassword: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Must contain an uppercase letter")
    .regex(/[0-9]/, "Must contain a number"),
});

const RefreshSchema = z.object({
  refreshToken: z.string().min(1, "Refresh token is required"),
});

const OAuthSchema = z.object({
  provider: z.enum(["google", "github"]),
  redirectTo: z.string().url("redirectTo must be a valid URL"),
});

const OAuthCallbackSchema = z.object({
  code: z.string().min(1, "Authorization code is required"),
});

const ResendVerificationSchema = z.object({
  email: z.string().email("Invalid email"),
});

// ── Routes ──────────────────────────────────────────────

export async function authRoutes(app: FastifyInstance): Promise<void> {
  // POST /auth/signup
  app.post("/signup", async (request, reply) => {
    const body = SignupSchema.parse(request.body);
    const result = await authService.signup(body);
    reply.status(201).send(result);
  });

  // POST /auth/login
  app.post("/login", async (request, reply) => {
    const body = LoginSchema.parse(request.body);
    const tokens = await authService.login(body);

    // Set refresh token as httpOnly cookie
    reply.setCookie("refresh_token", tokens.refreshToken, {
      httpOnly: true,
      secure: process.env["NODE_ENV"] === "production",
      // Cross-origin cookies (Netlify frontend → Cloud Run backend) require
      // SameSite=None + Secure in production. Keep "lax" in dev so localhost
      // browsers still send the cookie on top-level navigation.
      sameSite: process.env["NODE_ENV"] === "production" ? "none" : "lax",
      path: "/api/v1/auth/refresh",
      maxAge: 7 * 24 * 60 * 60, // 7 days
    });

    // Also include refreshToken in body — modern browsers block third-party
    // cookies, and the frontend's origin differs from the backend's. Frontend
    // stores it in localStorage as a fallback; the httpOnly cookie still gets
    // set for users / setups where it works.
    reply.send({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
      user: tokens.user,
    });
  });

  // POST /auth/refresh
  app.post("/refresh", async (request, reply) => {
    // Try cookie first, then body
    const cookieToken = (request.cookies as Record<string, string | undefined>)[
      "refresh_token"
    ];
    let refreshToken = cookieToken;

    if (!refreshToken) {
      const body = RefreshSchema.parse(request.body);
      refreshToken = body.refreshToken;
    }

    const tokens = await authService.refreshSession(refreshToken);

    reply.setCookie("refresh_token", tokens.refreshToken, {
      httpOnly: true,
      secure: process.env["NODE_ENV"] === "production",
      // Cross-origin cookies (Netlify frontend → Cloud Run backend) require
      // SameSite=None + Secure in production. Keep "lax" in dev so localhost
      // browsers still send the cookie on top-level navigation.
      sameSite: process.env["NODE_ENV"] === "production" ? "none" : "lax",
      path: "/api/v1/auth/refresh",
      maxAge: 7 * 24 * 60 * 60,
    });

    // Also include refreshToken in body — modern browsers block third-party
    // cookies, and the frontend's origin differs from the backend's. Frontend
    // stores it in localStorage as a fallback; the httpOnly cookie still gets
    // set for users / setups where it works.
    reply.send({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
      user: tokens.user,
    });
  });

  // POST /auth/logout
  app.post(
    "/logout",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const authHeader = request.headers.authorization ?? "";
      const token = authHeader.slice(7);
      await authService.logout(token);

      reply.clearCookie("refresh_token", { path: "/api/v1/auth/refresh" });
      reply.send({ message: "Logged out successfully" });
    },
  );

  // POST /auth/magic-callback
  // Frontend's /auth/callback page calls this after Supabase redirects from
  // the magic link with tokens in the URL hash. We validate the access token
  // (proves the user actually owns the email), ensure the profile exists,
  // and hand back the same shape /login returns.
  app.post("/magic-callback", async (request, reply) => {
    const body = MagicCallbackSchema.parse(request.body);
    const tokens = await authService.verifyMagicLink(
      body.accessToken,
      body.refreshToken,
    );

    reply.setCookie("refresh_token", tokens.refreshToken, {
      httpOnly: true,
      secure: process.env["NODE_ENV"] === "production",
      sameSite: process.env["NODE_ENV"] === "production" ? "none" : "lax",
      path: "/api/v1/auth/refresh",
      maxAge: 7 * 24 * 60 * 60,
    });

    reply.send({
      accessToken:  tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn:    tokens.expiresIn,
      user:         tokens.user,
    });
  });

  // POST /auth/resend-verification — re-sends the magic link
  app.post("/resend-verification", async (request, reply) => {
    const body = ResendVerificationSchema.parse(request.body);
    const result = await authService.resendVerificationEmail(body.email);
    reply.send(result);
  });

  // POST /auth/forgot-password
  app.post("/forgot-password", async (request, reply) => {
    const body = ForgotPasswordSchema.parse(request.body);
    const result = await authService.forgotPassword(body.email);
    reply.send(result);
  });

  // POST /auth/reset-password
  app.post("/reset-password", async (request, reply) => {
    const body = ResetPasswordSchema.parse(request.body);
    const result = await authService.resetPassword(
      body.accessToken,
      body.newPassword,
    );
    reply.send(result);
  });

  // POST /auth/oauth — get redirect URL for Google/GitHub
  app.post("/oauth", async (request, reply) => {
    const body = OAuthSchema.parse(request.body);
    const result = await authService.getOAuthUrl(
      body.provider,
      body.redirectTo,
    );
    reply.send(result);
  });

  // POST /auth/oauth/callback — exchange code for session
  app.post("/oauth/callback", async (request, reply) => {
    const body = OAuthCallbackSchema.parse(request.body);
    const tokens = await authService.exchangeOAuthCode(body.code);

    reply.setCookie("refresh_token", tokens.refreshToken, {
      httpOnly: true,
      secure: process.env["NODE_ENV"] === "production",
      // Cross-origin cookies (Netlify frontend → Cloud Run backend) require
      // SameSite=None + Secure in production. Keep "lax" in dev so localhost
      // browsers still send the cookie on top-level navigation.
      sameSite: process.env["NODE_ENV"] === "production" ? "none" : "lax",
      path: "/api/v1/auth/refresh",
      maxAge: 7 * 24 * 60 * 60,
    });

    // Also include refreshToken in body — modern browsers block third-party
    // cookies, and the frontend's origin differs from the backend's. Frontend
    // stores it in localStorage as a fallback; the httpOnly cookie still gets
    // set for users / setups where it works.
    reply.send({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
      user: tokens.user,
    });
  });
}
