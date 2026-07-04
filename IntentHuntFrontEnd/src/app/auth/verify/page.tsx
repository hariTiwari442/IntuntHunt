"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { Mail } from "lucide-react";

function VerifyContent() {
  const searchParams = useSearchParams();
  const email = searchParams.get("email") || "";
  const { resendVerification } = useAuth();
  const [error, setError] = useState("");
  const [resent, setResent] = useState(false);
  const [resending, setResending] = useState(false);

  const handleResend = async () => {
    if (!email) {
      setError("No email address — please sign up again.");
      return;
    }
    setError("");
    setResending(true);
    try {
      await resendVerification(email);
      setResent(true);
      setTimeout(() => setResent(false), 5_000);
    } catch {
      setError("Couldn't resend right now. Try again in a minute.");
    } finally {
      setResending(false);
    }
  };

  return (
    <AuthLayout
      title="Check your email"
      subtitle="We sent you a verification link"
    >
      <div className="text-center">
        <div className="w-16 h-16 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center mx-auto mb-6">
          <Mail className="w-8 h-8 text-accent" />
        </div>

        <p className="text-sm text-text-secondary mb-2">
          We sent a verification link to
        </p>
        {email && (
          <p className="text-base font-medium text-text-primary mb-6 break-all">
            {email}
          </p>
        )}

        <p className="text-sm text-text-secondary mb-8">
          Click the link in that email to verify your account.
          You&apos;ll be signed in automatically.
        </p>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
            {error}
          </div>
        )}

        <Button
          variant="ghost"
          onClick={handleResend}
          disabled={resent || resending}
          className="w-full"
        >
          {resending
            ? "Sending…"
            : resent
              ? "Email sent — check your inbox!"
              : "Resend verification email"}
        </Button>

        <p className="text-xs text-text-tertiary mt-6">
          Already verified?{" "}
          <Link href="/auth/login" className="text-accent hover:text-accent-hover transition-colors">
            Log in
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}

export default function VerifyPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
        </div>
      }
    >
      <VerifyContent />
    </Suspense>
  );
}
