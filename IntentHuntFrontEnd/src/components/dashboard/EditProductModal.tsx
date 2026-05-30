"use client";

import { useState } from "react";
import { useUpdateProduct } from "@/hooks/useJobs";
import { Button } from "@/components/ui/button";
import { X, Sparkles } from "lucide-react";

interface EditProductModalProps {
  productId:          string;
  initialDescription: string;
  onClose:            () => void;
}

export function EditProductModal({
  productId,
  initialDescription,
  onClose,
}: EditProductModalProps) {
  const [description, setDescription] = useState(initialDescription);
  const update = useUpdateProduct();
  const valid = description.trim().length >= 20;

  const handleSave = async () => {
    if (!valid) return;
    await update.mutateAsync({ productId, data: { description: description.trim() } });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl rounded-2xl bg-bg-secondary border border-border-default shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-default">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-accent" />
            <h3 className="font-semibold">Edit search prompt</h3>
          </div>
          <button
            onClick={onClose}
            className="text-text-tertiary hover:text-text-primary transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4">
          <label className="block text-xs font-semibold uppercase tracking-wider text-text-tertiary mb-1.5">
            Product description
          </label>
          <p className="text-xs text-text-secondary mb-3 leading-relaxed">
            Update your product description. Next time you click <strong>Find Leads</strong>,
            we&apos;ll regenerate the search queries (audience, pains, competitors) based on this.
          </p>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={10}
            placeholder="Describe what your product does, who it&rsquo;s for, what alternatives it competes with, and what triggers a buyer to look for it."
            className="w-full px-3 py-2 rounded-lg text-sm bg-bg-primary text-text-primary border border-border-default focus:border-accent/50 outline-none resize-y"
          />
          {!valid && (
            <p className="text-[11px] text-text-tertiary mt-1.5">
              Please write at least 20 characters.
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border-default">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!valid || update.isPending}>
            {update.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}
