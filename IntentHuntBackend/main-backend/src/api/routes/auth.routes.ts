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

const VerifyOtpSchema = z.object({
  email: z.string().email("Invalid email"),
  token: z.string().length(6, "OTP must be 6 digits"),
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

const ResendOtpSchema = z.object({
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
      sameSite: "strict",
      path: "/api/v1/auth/refresh",
      maxAge: 7 * 24 * 60 * 60, // 7 days
    });

    reply.send({
      accessToken: tokens.accessToken,
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
      sameSite: "strict",
      path: "/api/v1/auth/refresh",
      maxAge: 7 * 24 * 60 * 60,
    });

    reply.send({
      accessToken: tokens.accessToken,
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

  // POST /auth/verify-email
  app.post("/verify-email", async (request, reply) => {
    const body = VerifyOtpSchema.parse(request.body);
    const tokens = await authService.verifyEmailOtp(body.email, body.token);

    reply.setCookie("refresh_token", tokens.refreshToken, {
      httpOnly: true,
      secure: process.env["NODE_ENV"] === "production",
      sameSite: "strict",
      path: "/api/v1/auth/refresh",
      maxAge: 7 * 24 * 60 * 60,
    });

    reply.send({
      accessToken: tokens.accessToken,
      expiresIn: tokens.expiresIn,
      user: tokens.user,
    });
  });

  // POST /auth/resend-otp
  app.post("/resend-otp", async (request, reply) => {
    const body = ResendOtpSchema.parse(request.body);
    const result = await authService.resendOtp(body.email);
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
      sameSite: "strict",
      path: "/api/v1/auth/refresh",
      maxAge: 7 * 24 * 60 * 60,
    });

    reply.send({
      accessToken: tokens.accessToken,
      expiresIn: tokens.expiresIn,
      user: tokens.user,
    });
  });
}
