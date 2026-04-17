import { supabase, supabaseAdmin } from '../config/supabase.js';
import { prisma } from '../db/prisma.client.js';
import { logger } from '../utils/logger.js';
import { BadRequestError, UnauthorizedError, ConflictError } from '../utils/errors.js';

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

  // Create user in Supabase Auth
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: false, // user must verify via OTP
    user_metadata: { name: name ?? '' },
  });

  if (error) {
    logger.error({ err: error }, 'Supabase signup failed');
    if (error.message.includes('already registered')) {
      throw new ConflictError('An account with this email already exists');
    }
    throw new BadRequestError(error.message);
  }

  // Create profile in our DB (upsert to handle retried signups gracefully)
  await prisma.profile.upsert({
    where: { id: data.user.id },
    update: {},
    create: {
      id: data.user.id,
      email,
      name: name ?? null,
    },
  });

  // Send OTP for email verification
  const { error: otpError } = await supabase.auth.signInWithOtp({ email });
  if (otpError) {
    logger.warn({ err: otpError }, 'Failed to send verification OTP');
  }

  return { message: 'Account created. Check your email for verification OTP.' };
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

// ── Verify Email OTP ────────────────────────────────────

export async function verifyEmailOtp(email: string, token: string): Promise<AuthTokens> {
  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: 'email',
  });

  if (error || !data.session) {
    throw new BadRequestError('Invalid or expired OTP');
  }

  const profile = await ensureProfile(data.user!.id, email);

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

// ── Resend OTP ──────────────────────────────────────────

export async function resendOtp(email: string): Promise<{ message: string }> {
  const { error } = await supabase.auth.signInWithOtp({ email });

  if (error) {
    logger.warn({ email, err: error }, 'Resend OTP failed');
    throw new BadRequestError('Failed to send OTP. Please try again.');
  }

  return { message: 'OTP sent to your email.' };
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
