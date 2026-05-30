"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useCreateProduct } from "@/hooks/useJobs";
import { Sparkles, Loader2, ArrowRight } from "lucide-react";

export default function AddProductPage() {
  const router = useRouter();
  const create = useCreateProduct();

  const [productName, setProductName]   = useState("");
  const [description, setDescription]   = useState("");
  const [productUrl, setProductUrl]     = useState("");
  const [error, setError]               = useState("");

  const handleCreate = async () => {
    if (description.trim().length < 20) {
      setError("Please describe your product in at least 20 characters.");
      return;
    }
    setError("");

    const product = await create.mutateAsync({
      name:        productName.trim() || undefined,
      description: description.trim(),
      productUrl:  productUrl.trim() || undefined,
    });

    // Jump straight to the product page — Find Leads runs Step 1 lazily.
    router.push(`/dashboard/products/${product.id}`);
  };

  return (
    <>
      <DashboardHeader title="Add product" subtitle="Tell us about your product so we can find buyers" />

      <Card className="!p-6 max-w-2xl">
        <div className="space-y-5">
          <div>
            <label className="text-xs uppercase tracking-wider text-text-tertiary mb-1.5 block">
              Product name (optional)
            </label>
            <Input
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              placeholder="e.g. Repeatly"
            />
          </div>

          <div>
            <label className="text-xs uppercase tracking-wider text-text-tertiary mb-1.5 block">
              Product URL (optional)
            </label>
            <Input
              type="url"
              value={productUrl}
              onChange={(e) => setProductUrl(e.target.value)}
              placeholder="https://repeatly.app"
            />
          </div>

          <div>
            <label className="text-xs uppercase tracking-wider text-text-tertiary mb-1.5 block">
              Description <span className="text-red-600">*</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={6}
              placeholder="e.g. Chrome extension for YouTube that lets users repeat specific sections of videos. Set start/end times to loop a section, queue multiple sections, control playback speed. Built for musicians, language learners, and students."
              className="w-full px-3 py-2 rounded-lg text-sm bg-bg-secondary text-text-primary border border-border-default focus:border-accent/50 outline-none resize-y"
            />
            <p className="text-[11px] text-text-tertiary mt-1">
              The more specific, the better. We&apos;ll extract competitors, pains, and audience signals automatically when you click <strong>Find Leads</strong>.
            </p>
          </div>

          {error && (
            <p className="text-xs text-red-600">{error}</p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => router.push("/dashboard/products")}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={create.isPending}>
              {create.isPending ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Creating…
                </>
              ) : (
                <>
                  <Sparkles size={14} />
                  Create product
                  <ArrowRight size={14} />
                </>
              )}
            </Button>
          </div>
        </div>
      </Card>
    </>
  );
}
