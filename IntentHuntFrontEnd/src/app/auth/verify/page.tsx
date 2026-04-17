"use client";

import { useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { OtpInput } from "@/components/auth/OtpInput";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { Mail } from "lucide-react";

function VerifyContent() {
  const searchParams = useSearchParams();
  const email = searchParams.get("email") || "";
  const router = useRouter();
  const { verifyEmail, resendOtp } = useAuth();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resent, setResent] = useState(false);

  const handleComplete = async (otp: string) => {
    setError("");
    setLoading(true);
    try {
      await verifyEmail({ email, token: otp });
      router.push("/auth/login");
    } catch (err: any) {
      setError(err.response?.data?.message || "Invalid code. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    try {
      await resendOtp(email);
      setResent(true);
      setTimeout(() => setResent(false), 5000);
    } catch {
      setError("Failed to resend code.");
    }
  };

  return (
    <AuthLayout title="Verify your email" subtitle="Enter the 6-digit code we sent to your email">
      <div className="text-center mb-8">
        <div className="w-16 h-16 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center mx-auto mb-4">
          <Mail className="w-8 h-8 text-accent" />
        </div>
        {email && (
          <p className="text-sm text-white/50">
            Code sent to <span className="text-white">{email}</span>
          </p>
        )}
      </div>

      <OtpInput onComplete={handleComplete} />

      {error && (
        <div className="mt-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm text-center">
          {error}
        </div>
      )}

      {loading && (
        <div className="mt-4 flex justify-center">
          <div className="w-6 h-6 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
        </div>
      )}

      <div className="mt-6 text-center">
        <Button variant="ghost" onClick={handleResend} disabled={resent}>
          {resent ? "Code resent!" : "Resend code"}
        </Button>
      </div>
    </AuthLayout>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
      </div>
    }>
      <VerifyContent />
    </Suspense>
  );
}
