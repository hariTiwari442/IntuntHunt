import { supabase, supabaseAdmin } from '../config/supabase.js';
import { prisma } from '../db/prisma.client.js';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';
import { BadRequestError, UnauthorizedError, ConflictError } from '../utils/errors.js';

// All signup/resend flows redirect the magic link back to this single
// frontend route. The page reads the access_token + refresh_token from
// the URL hash and POSTs them to /auth/magic-callback to finalize.
const MAGIC_LINK_REDIRECT = `${env.APP_URL}/auth/callback`;

// ── Types ────────────────────────────────────────────────

export interface SignupInput {
  email: string;
  password: string;
  name?: string | undefined;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: {
    id: string;
    email: string;
    name: string | null;
    avatarUrl: string | null;
    plan: string;
  };
}

export interface OAuthResult {
  url: string;
}

// ── Signup ───────────────────────────────────────────────

export async function signup(input: SignupInput): Promise<{ message: string }> {
  const { email, password, name } = input;

  // Check if profile already exists
  const existing = await prisma.profile.findUnique({ where: { email } });
  if (existing) {
    throw new ConflictError('An account with this email already exists');
  }

  // Use the regular `auth.signUp` (not admin.createUser) so Supabase sends
  // the confirmation EMAIL itself, with `emailRedirectTo` pointing at our
  // frontend's /auth/callback. The email contains a magic link — clicking
  // it confirms the email AND issues a session in one step, redirecting
  // the user back to us with tokens in the URL hash.
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: MAGIC_LINK_REDIRECT,
      data: { name: name ?? '' },
    },
  });

  if (error) {
    logger.error({ err: error }, 'Supabase signup failed');
    if (error.message.toLowerCase().includes('already registered') ||
        error.message.toLowerCase().includes('user already')) {
      throw new ConflictError('An account with this email already exists');
    }
    throw new BadRequestError(error.message);
  }

  if (!data.user) {
    throw new BadRequestError('Signup did not create a user');
  }

  // Create profile in our DB (upsert handles retried signups). Profile is
  // created BEFORE email verification — that's fine; plan-enforcement gates
  // off planStatus, not email_confirmed.
  await prisma.profile.upsert({
    where: { id: data.user.id },
    update: {},
    create: {
      id: data.user.id,
      email,
      name: name ?? null,
    },
  });

  return { message: 'Account created. Check your email for a verification link.' };
}

// ── Login ───────────────────────────────────────────────

export async function login(input: LoginInput): Promise<AuthTokens> {
  const { email, password } = input;

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    logger.warn({ email, err: error.message }, 'Login failed');
    throw new UnauthorizedError('Invalid email or password');
  }

  if (!data.session) {
    throw new UnauthorizedError('No session returned');
  }

  // Ensure profile exists (could be missing if user signed up via OAuth first)
  const profile = await ensureProfile(data.user.id, data.user.email ?? email);

  return {
    accessToken:  data.session.access_token,
    refreshToken: data.session.refresh_token,
    expiresIn:    data.session.expires_in,
    user: {
      id:        profile.id,
      email:     profile.email,
      name:      profile.name,
      avatarUrl: profile.avatarUrl,
      plan:      profile.plan,
    },
  };
}

// ── Refresh Token ───────────────────────────────────────

export async function refreshSession(refreshToken: string): Promise<AuthTokens> {
  const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });

  if (error || !data.session) {
    throw new UnauthorizedError('Invalid or expired refresh token');
  }

  const profile = await ensureProfile(data.user!.id, data.user!.email ?? '');

  return {
    accessToken:  data.session.access_token,
    refreshToken: data.session.refresh_token,
    expiresIn:    data.session.expires_in,
    user: {
      id:        profile.id,
      email:     profile.email,
      name:      profile.name,
      avatarUrl: profile.avatarUrl,
      plan:      profile.plan,
    },
  };
}

// ── Logout ──────────────────────────────────────────────

export async function logout(accessToken: string): Promise<void> {
  // Use admin client to revoke session server-side
  const { error } = await supabaseAdmin.auth.admin.signOut(accessToken, 'global');
  if (error) {
    logger.warn({ err: error }, 'Logout error (non-blocking)');
  }
}

// ── Magic Link Callback ─────────────────────────────────
// Called by the frontend's /auth/callback page after the user clicks
// the magic link in their email. Supabase has already verified the link
// and dropped a real (Supabase) session in the URL hash; we just adopt
// those tokens as our own — they ARE the session.
export async function verifyMagicLink(
  accessToken:  string,
  refreshToken: string,
): Promise<AuthTokens> {
  // Validate the access token by asking Supabase who it belongs to. This
  // also doubles as a forgery check — a tampered token would fail here.
  const { data: userData, error } = await supabase.auth.getUser(accessToken);
  if (error || !userData.user) {
    throw new UnauthorizedError('Invalid or expired magic link');
  }
  const user = userData.user;

  // Ensure profile exists (signup creates it pre-verification, but if a
  // user somehow lands here without one — e.g. they were created via
  // admin or a third party — we self-heal).
  const profile = await ensureProfile(
    user.id,
    user.email ?? '',
    user.user_metadata?.['name'] as string | undefined,
  );

  // Supabase doesn't separately tell us the expires_in for an externally-
  // delivered token, so we hand back the standard hour (matches Supabase's
  // default) — the frontend's refresh interceptor handles drift.
  return {
    accessToken,
    refreshToken,
    expiresIn: 3600,
    user: {
      id:        profile.id,
      email:     profile.email,
      name:      profile.name,
      avatarUrl: profile.avatarUrl,
      plan:      profile.plan,
    },
  };
}

// ── Resend Verification Link ────────────────────────────
// Renamed from "resendOtp" — now triggers a fresh magic link instead.
export async function resendVerificationEmail(email: string): Promise<{ message: string }> {
  const { error } = await supabase.auth.resend({
    type:    'signup',
    email,
    options: { emailRedirectTo: MAGIC_LINK_REDIRECT },
  });

  if (error) {
    logger.warn({ email, err: error }, 'Resend verification email failed');
    throw new BadRequestError('Failed to send verification email. Please try again.');
  }

  return { message: 'Verification email sent.' };
}

// ── Forgot Password ─────────────────────────────────────

export async function forgotPassword(email: string): Promise<{ message: string }> {
  const { error } = await supabase.auth.resetPasswordForEmail(email);

  if (error) {
    logger.warn({ email, err: error }, 'Forgot password request failed');
  }

  // Always return success to prevent email enumeration
  return { message: 'If an account exists with that email, a reset link has been sent.' };
}

// ── Reset Password ──────────────────────────────────────

export async function resetPassword(accessToken: string, newPassword: string): Promise<{ message: string }> {
  // The user clicks the reset link → gets a session → calls this with the new password
  // We need to set the session first so updateUser works
  const { error: sessionError } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: '', // not needed for password update
  });

  if (sessionError) {
    throw new UnauthorizedError('Invalid or expired reset token');
  }

  const { error } = await supabase.auth.updateUser({ password: newPassword });

  if (error) {
    throw new BadRequestError(error.message);
  }

  return { message: 'Password updated successfully.' };
}

// ── OAuth (Google / GitHub) ─────────────────────────────

export async function getOAuthUrl(
  provider: 'google' | 'github',
  redirectTo: string,
): Promise<OAuthResult> {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo },
  });

  if (error || !data.url) {
    throw new BadRequestError(`Failed to initiate ${provider} OAuth`);
  }

  return { url: data.url };
}

// ── Exchange OAuth Code for Session ─────────────────────

export async function exchangeOAuthCode(code: string): Promise<AuthTokens> {
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.session) {
    throw new UnauthorizedError('Invalid OAuth code');
  }

  const user = data.user;
  const profile = await ensureProfile(
    user.id,
    user.email ?? '',
    user.user_metadata?.['full_name'] as string | undefined,
    user.user_metadata?.['avatar_url'] as string | undefined,
  );

  return {
    accessToken:  data.session.access_token,
    refreshToken: data.session.refresh_token,
    expiresIn:    data.session.expires_in,
    user: {
      id:        profile.id,
      email:     profile.email,
      name:      profile.name,
      avatarUrl: profile.avatarUrl,
      plan:      profile.plan,
    },
  };
}

// ── Helpers ─────────────────────────────────────────────

async function ensureProfile(
  userId: string,
  email: string,
  name?: string,
  avatarUrl?: string,
) {
  let profile = await prisma.profile.findUnique({ where: { id: userId } });

  if (!profile) {
    profile = await prisma.profile.create({
      data: {
        id: userId,
        email,
        name: name ?? null,
        avatarUrl: avatarUrl ?? null,
      },
    });
    logger.info({ userId, email }, 'Auto-created profile');
  }

  return profile;
}
