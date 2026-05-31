"use client";

import { useState } from "react";
import Link from "next/link";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useProducts, useDeleteProduct, type Product } from "@/hooks/useJobs";
import {
  Package,
  Plus,
  ArrowUpRight,
  ArrowRight,
  Loader2,
  Trash2,
  AlertTriangle,
  X,
  TrendingUp,
} from "lucide-react";

// Deterministic gradient based on product name — so each product gets a stable color
const AVATAR_GRADIENTS = [
  "from-emerald-400 to-teal-500",
  "from-violet-400 to-purple-500",
  "from-orange-400 to-rose-500",
  "from-sky-400 to-blue-500",
  "from-amber-400 to-orange-500",
  "from-pink-400 to-fuchsia-500",
  "from-cyan-400 to-emerald-500",
  "from-indigo-400 to-violet-500",
];

function gradientFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length]!;
}

function timeAgo(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const sec = Math.max(0, Math.floor((now - then) / 1000));
  if (sec < 60)   return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60)   return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24)    return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  if (d < 7)      return `${d}d ago`;
  if (d < 30)     return `${Math.floor(d / 7)}w ago`;
  return new Date(iso).toLocaleDateString();
}

function DeleteProductModal({ product, onClose }: { product: Product; onClose: () => void }) {
  const [confirmName, setConfirmName] = useState("");
  const deleteProduct = useDeleteProduct();
  const expected = product.name.trim() || "delete";
  const isMatch = confirmName.trim().toLowerCase() === expected.toLowerCase();

  const handleDelete = async () => {
    if (!isMatch) return;
    try {
      await deleteProduct.mutateAsync(product.id);
      onClose();
    } catch {
      // error handled by react-query
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md mx-4 rounded-2xl border border-red-200 bg-bg-secondary p-6 shadow-2xl">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-text-tertiary hover:text-text-secondary transition-colors"
        >
          <X size={18} />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center">
            <AlertTriangle size={20} className="text-red-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">Delete product</h3>
            <p className="text-xs text-text-tertiary">This action cannot be undone</p>
          </div>
        </div>

        <p className="text-sm text-text-secondary mb-4">
          This permanently deletes <span className="text-text-primary font-medium">{product.name || "this product"}</span> and all its leads.
        </p>

        <div className="mb-5">
          <label className="block text-xs text-text-tertiary mb-2">
            Type <span className="text-red-600 font-medium">{expected}</span> to confirm
          </label>
          <Input
            value={confirmName}
            onChange={(e) => setConfirmName(e.target.value)}
            placeholder={expected}
          />
        </div>

        <div className="flex items-center gap-3">
          <Button variant="secondary" onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <button
            onClick={handleDelete}
            disabled={!isMatch || deleteProduct.isPending}
            className={`flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
              isMatch
                ? "bg-red-600 text-white border border-red-600 hover:bg-red-700 cursor-pointer"
                : "bg-bg-muted text-text-tertiary border border-border-default cursor-not-allowed"
            }`}
          >
            {deleteProduct.isPending ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            {deleteProduct.isPending ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}

const PLATFORM_PILLS = [
  { name: "Reddit",   dot: "bg-orange-500" },
  { name: "LinkedIn", dot: "bg-blue-600"   },
  { name: "Twitter",  dot: "bg-sky-500"    },
];

function ProductRow({ product }: { product: Product }) {
  const [showDelete, setShowDelete] = useState(false);

  const name      = product.name?.trim() || "Untitled product";
  const initial   = name[0]!.toUpperCase();
  const gradient  = gradientFor(name);
  const leadCount = product.leadCount ?? 0;

  return (
    <>
      <Link href={`/dashboard/products/${product.id}`} className="block group">
        <div className="relative bg-bg-secondary border border-border-default rounded-2xl p-6 transition-all duration-200 hover:border-accent/40 hover:shadow-[0_8px_30px_-12px_rgba(22,163,74,0.18)] hover:-translate-y-0.5">
          {/* Top row: avatar + platform pills + delete (hover) */}
          <div className="flex items-start justify-between mb-4">
            <div
              className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${gradient} flex items-center justify-center shrink-0 shadow-sm`}
            >
              <span className="text-white text-lg font-bold">{initial}</span>
            </div>

            <div className="flex items-center gap-1.5">
              {PLATFORM_PILLS.map((p) => (
                <span
                  key={p.name}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-accent-soft text-accent"
                >
                  <span className={`w-1 h-1 rounded-full ${p.dot}`} />
                  {p.name}
                </span>
              ))}
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setShowDelete(true);
                }}
                className="ml-1 opacity-0 group-hover:opacity-100 p-1.5 rounded-md text-text-tertiary hover:text-red-600 hover:bg-red-50 transition-all"
                title="Delete product"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>

          {/* Name + description */}
          <h3 className="text-xl font-bold text-text-primary mb-1.5 truncate">{name}</h3>
          <p className="text-sm text-text-secondary line-clamp-2 leading-relaxed mb-5">
            {product.description}
          </p>

          {/* Big stat block */}
          <div className="rounded-xl bg-bg-muted/60 border border-border-default px-4 py-3 mb-4">
            <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-text-tertiary font-semibold mb-1">
              <TrendingUp size={11} className="text-accent" strokeWidth={2.5} />
              Total Leads
            </div>
            <div className="flex items-baseline gap-2.5">
              <div className="text-3xl font-bold text-text-primary tabular-nums">
                {leadCount.toLocaleString()}
              </div>
              {(product.newLeadCount ?? 0) > 0 && (
                <span
                  title="Found within the last 24 hours"
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold bg-accent-soft text-accent cursor-help"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                  +{product.newLeadCount} new
                </span>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between pt-3 border-t border-border-default">
            <span className="text-sm font-semibold text-accent inline-flex items-center gap-1.5">
              View leads
            </span>
            <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-accent-soft text-accent group-hover:bg-accent group-hover:text-white group-hover:translate-x-0.5 transition-all">
              <ArrowRight size={15} strokeWidth={2.5} />
            </span>
          </div>
        </div>
      </Link>

      {showDelete && (
        <DeleteProductModal product={product} onClose={() => setShowDelete(false)} />
      )}
    </>
  );
}

export default function ProductsPage() {
  const { data: productsData, isLoading } = useProducts();
  const products = productsData?.products ?? [];

  return (
    <>
      <DashboardHeader title="Products" subtitle="Your tracked products" />

      <div className="flex justify-end mb-6">
        <Link href="/dashboard/products/new">
          <Button>
            <Plus size={16} />
            Add Product
          </Button>
        </Link>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
      ) : products.length === 0 ? (
        <Card className="!p-12 text-center">
          <Package className="w-12 h-12 text-text-tertiary mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">No products yet</h3>
          <p className="text-sm text-text-secondary mb-6">
            Add your first product and we&apos;ll find buyers for it.
          </p>
          <Link href="/dashboard/products/new">
            <Button>
              <Plus size={16} /> Add your first product
            </Button>
          </Link>
        </Card>
      ) : (
        <div className="space-y-3">
          {products.map((p) => <ProductRow key={p.id} product={p} />)}
        </div>
      )}
    </>
  );
}
