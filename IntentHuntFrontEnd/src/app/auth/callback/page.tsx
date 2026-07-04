"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, AlertCircle } from "lucide-react";

/**
 * /auth/callback — the single landing page for any Supabase auth redirect.
 *
 * Handles two distinct flows:
 *
 *   1. MAGIC LINK (signup verification)
 *      Hash fragment: #access_token=...&refresh_token=...&type=signup
 *      → POSTs to /auth/magic-callback
 *
 *   2. OAUTH (Google sign-in via PKCE)
 *      Query string: ?code=...
 *      → POSTs to /auth/oauth/callback
 *
 * Hash fragments are client-side only (the server never sees them), so
 * this whole page runs as a client component.
 */
function CallbackInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { verifyMagicLink, exchangeOAuthCode } = useAuth();
  const handledRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (handledRef.current) return;
    if (typeof window === "undefined") return;
    handledRef.current = true;

    // Both flows can return an error in the query string OR the hash.
    const hash = window.location.hash.startsWith("#")
      ? window.location.hash.slice(1)
      : window.location.hash;
    const hashParams = new URLSearchParams(hash);

    const errParam =
      hashParams.get("error_description") ||
      hashParams.get("error") ||
      searchParams.get("error_description") ||
      searchParams.get("error");

    if (errParam) {
      setError(decodeURIComponent(errParam.replace(/\+/g, " ")));
      return;
    }

    // OAuth (Google) — Supabase returns the code in the query string.
    const code = searchParams.get("code");
    if (code) {
      (async () => {
        try {
          await exchangeOAuthCode(code);
          window.history.replaceState(null, "", window.location.pathname);
          router.replace("/dashboard");
        } catch (err: unknown) {
          const message =
            (err as { response?: { data?: { message?: string } } })?.response
              ?.data?.message ?? "Sign-in failed. Try again.";
          setError(message);
        }
      })();
      return;
    }

    // Magic link — tokens come in the URL hash.
    const accessToken  = hashParams.get("access_token");
    const refreshToken = hashParams.get("refresh_token");
    if (accessToken && refreshToken) {
      (async () => {
        try {
          await verifyMagicLink({ accessToken, refreshToken });
          window.history.replaceState(null, "", window.location.pathname);
          router.replace("/dashboard");
        } catch (err: unknown) {
          const message =
            (err as { response?: { data?: { message?: string } } })?.response
              ?.data?.message ??
            "Could not verify your email. Try requesting a new link.";
          setError(message);
        }
      })();
      return;
    }

    setError(
      "Missing sign-in tokens. Try the link from your email again, or sign in below.",
    );
  }, [verifyMagicLink, exchangeOAuthCode, router, searchParams]);

  return (
    <AuthLayout
      title={error ? "Sign-in failed" : "Signing you in"}
      subtitle={error ? "Something went wrong" : "Just a moment…"}
    >
      <div className="text-center">
        {!error ? (
          <>
            <div className="w-16 h-16 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center mx-auto mb-6">
              <Loader2 className="w-8 h-8 text-accent animate-spin" />
            </div>
            <p className="text-sm text-text-secondary">
              You&apos;ll be redirected in a second.
            </p>
          </>
        ) : (
          <>
            <div className="w-16 h-16 rounded-2xl bg-red-50 border border-red-200 flex items-center justify-center mx-auto mb-6">
              <AlertCircle className="w-8 h-8 text-red-600" />
            </div>
            <p className="text-sm text-text-secondary mb-6">{error}</p>
            <div className="flex gap-3 justify-center text-sm">
              <Link
                href="/auth/login"
                className="text-accent hover:text-accent-hover transition-colors"
              >
                Log in
              </Link>
              <span className="text-text-tertiary">·</span>
              <Link
                href="/auth/signup"
                className="text-accent hover:text-accent-hover transition-colors"
              >
                Sign up
              </Link>
            </div>
          </>
        )}
      </div>
    </AuthLayout>
  );
}

export default function CallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
        </div>
      }
    >
      <CallbackInner />
    </Suspense>
  );
}
