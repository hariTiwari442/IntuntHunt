"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useCreateJob, useGenerateKeywords, type CrawlJobQueries } from "@/hooks/useJobs";
import { usePlan } from "@/hooks/usePlan";
import {
  Sparkles,
  Loader2,
  ArrowRight,
  Lock,
  X,
  Plus,
  Check,
  Brain,
  Users,
  AlertTriangle,
  Swords,
  Zap,
  Search,
  Hash,
  MessageSquare as HNIcon,
  Briefcase,
} from "lucide-react";

type Step = "describe" | "review" | "launching";

interface Intelligence {
  productName: string;
  category: string;
  problem: string;
  audience: string;
  pains: string[];
  alternatives: string[];
  triggers: string[];
}

export default function AddProductPage() {
  const router = useRouter();
  const generateKeywords = useGenerateKeywords();
  const createJob = useCreateJob();
  const { can } = usePlan();

  const [step, setStep] = useState<Step>("describe");
  const [productName, setProductName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");

  // AI intelligence
  const [intelligence, setIntelligence] = useState<Intelligence | null>(null);
  const [productId, setProductId] = useState<string | null>(null);

  // Generated/editable keywords
  const [redditGlobal, setRedditGlobal] = useState<string[]>([]);
  const [redditSubreddit, setRedditSubreddit] = useState<string[]>([]);
  const [hackernews, setHackernews] = useState<string[]>([]);
  const [linkedin, setLinkedin] = useState<string[]>([]);
  const [subreddits, setSubreddits] = useState<string[]>([]);

  // Temp inputs
  const [rgInput, setRgInput] = useState("");
  const [rsInput, setRsInput] = useState("");
  const [hnInput, setHnInput] = useState("");
  const [liInput, setLiInput] = useState("");
  const [subInput, setSubInput] = useState("");

  const handleGenerate = async () => {
    if (!productName.trim()) {
      setError("Please enter your product name.");
      return;
    }
    if (description.trim().length < 20) {
      setError("Please describe your product in at least 20 characters so we can find the right leads.");
      return;
    }
    setError("");
    try {
      const data = await generateKeywords.mutateAsync({
        name: productName.trim(),
        description: description.trim(),
      });
      if (data.productId) setProductId(data.productId);
      if (data.intelligence) setIntelligence(data.intelligence);
      if (data.queries?.redditGlobal) setRedditGlobal(data.queries.redditGlobal);
      if (data.queries?.redditSubreddit) setRedditSubreddit(data.queries.redditSubreddit);
      if (data.queries?.hackernews && can("hackernews")) setHackernews(data.queries.hackernews);
      if (data.queries?.linkedin) setLinkedin(data.queries.linkedin);
      if (data.subreddits) setSubreddits(data.subreddits);
      setStep("review");
    } catch (err: any) {
      setError(err.response?.data?.message || "Failed to generate keywords. Please try again.");
    }
  };

  const addToList = (
    value: string,
    list: string[],
    setter: (v: string[]) => void,
    inputSetter: (v: string) => void
  ) => {
    const trimmed = value.trim();
    if (trimmed && !list.includes(trimmed)) {
      setter([...list, trimmed]);
      inputSetter("");
    }
  };

  const removeFromList = (value: string, list: string[], setter: (v: string[]) => void) => {
    setter(list.filter((v) => v !== value));
  };

  const handleLaunch = async () => {
    const queries: CrawlJobQueries = {};
    if (redditGlobal.length > 0) queries.redditGlobal = redditGlobal;
    if (redditSubreddit.length > 0) queries.redditSubreddit = redditSubreddit;
    if (hackernews.length > 0) queries.hackernews = hackernews;
    if (linkedin.length > 0) queries.linkedin = linkedin;

    if (!queries.redditGlobal && !queries.redditSubreddit && !queries.hackernews && !queries.linkedin) {
      setError("You need at least one search query to find leads.");
      return;
    }

    setError("");
    setStep("launching");
    try {
      const job = await createJob.mutateAsync({
        queries,
        subreddits: subreddits.length > 0 ? subreddits : undefined,
        ...(productId ? { productId } : {}),
      });
      router.push(`/dashboard/products/${job.jobId}`);
    } catch (err: any) {
      setError(err.response?.data?.message || "Failed to start crawl. Please try again.");
      setStep("review");
    }
  };

  return (
    <>
      <DashboardHeader title="Add Product" subtitle="Tell us what you sell and we'll find your leads" />

      {/* Step 1: Describe */}
      {step === "describe" && (
        <Card className="max-w-2xl !p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
              <Sparkles size={20} className="text-accent" />
            </div>
            <div>
              <h2 className="font-semibold">Tell us about your product</h2>
              <p className="text-sm text-white/40">
                We&apos;ll use this to find the right conversations for you.
              </p>
            </div>
          </div>

          <div className="mb-4">
            <label className="text-sm font-medium mb-1.5 block text-white/70">Product Name</label>
            <Input
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              placeholder="e.g., PitchDrop, Acme CRM, My SaaS Tool"
            />
          </div>

          <div className="mb-1">
            <label className="text-sm font-medium mb-1.5 block text-white/70">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g., A cold email tool that helps B2B sales teams automate outreach sequences, manage follow-ups, and track replies. Our target customers are SDRs and founders doing outbound sales who are frustrated with expensive tools like Lemlist and Instantly."
              rows={5}
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-border-default text-white text-sm outline-none transition-all placeholder:text-text-tertiary focus:border-accent/50 focus:shadow-[0_0_0_3px_rgba(180,247,77,0.1)] resize-none leading-relaxed"
            />
          </div>

          <p className="text-xs text-white/30 mt-1 mb-6">
            The more detail you provide, the better we can target the right conversations.
          </p>

          {error && (
            <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              {error}
            </div>
          )}

          <Button onClick={handleGenerate} disabled={generateKeywords.isPending} size="lg">
            {generateKeywords.isPending ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                Analyzing your product...
              </>
            ) : (
              <>
                Find my leads
                <ArrowRight size={18} />
              </>
            )}
          </Button>
        </Card>
      )}

      {/* Step 2: Review intelligence + keywords */}
      {step === "review" && (
        <div className="max-w-3xl space-y-6">
          {/* Product Intelligence Card */}
          {intelligence && (
            <Card className="!p-6 !border-accent/10 bg-gradient-to-br from-accent/[0.03] to-transparent">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
                  <Brain size={20} className="text-accent" />
                </div>
                <div>
                  <h2 className="font-semibold text-lg">{intelligence.productName}</h2>
                  <p className="text-sm text-white/40">{intelligence.category}</p>
                </div>
              </div>

              {/* Problem & Audience */}
              <div className="grid md:grid-cols-2 gap-4 mb-5">
                <div className="p-4 rounded-xl bg-white/[0.03] border border-border-default">
                  <div className="flex items-center gap-2 mb-2">
                    <Zap size={14} className="text-accent" />
                    <span className="text-xs font-medium uppercase tracking-wider text-white/50">What it solves</span>
                  </div>
                  <p className="text-sm text-white/70 leading-relaxed">{intelligence.problem}</p>
                </div>
                <div className="p-4 rounded-xl bg-white/[0.03] border border-border-default">
                  <div className="flex items-center gap-2 mb-2">
                    <Users size={14} className="text-cyan-400" />
                    <span className="text-xs font-medium uppercase tracking-wider text-white/50">Target audience</span>
                  </div>
                  <p className="text-sm text-white/70 leading-relaxed">{intelligence.audience}</p>
                </div>
              </div>

              {/* Pains, Alternatives, Triggers */}
              <div className="grid md:grid-cols-3 gap-4">
                <div className="p-4 rounded-xl bg-white/[0.03] border border-border-default">
                  <div className="flex items-center gap-2 mb-3">
                    <AlertTriangle size={14} className="text-amber-400" />
                    <span className="text-xs font-medium uppercase tracking-wider text-white/50">Pain points</span>
                  </div>
                  <ul className="space-y-2">
                    {intelligence.pains.map((pain, i) => (
                      <li key={i} className="text-xs text-white/55 flex items-start gap-2">
                        <span className="text-amber-400/60 mt-0.5">&#8226;</span>
                        {pain}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="p-4 rounded-xl bg-white/[0.03] border border-border-default">
                  <div className="flex items-center gap-2 mb-3">
                    <Swords size={14} className="text-red-400" />
                    <span className="text-xs font-medium uppercase tracking-wider text-white/50">Competitors</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {intelligence.alternatives.map((alt, i) => (
                      <span
                        key={i}
                        className="px-2 py-1 rounded-md bg-red-500/10 text-red-400/80 text-xs"
                      >
                        {alt}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-white/[0.03] border border-border-default">
                  <div className="flex items-center gap-2 mb-3">
                    <Zap size={14} className="text-accent" />
                    <span className="text-xs font-medium uppercase tracking-wider text-white/50">Buying triggers</span>
                  </div>
                  <ul className="space-y-2">
                    {intelligence.triggers.map((trigger, i) => (
                      <li key={i} className="text-xs text-white/55 flex items-start gap-2">
                        <span className="text-accent/60 mt-0.5">&#8226;</span>
                        {trigger}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </Card>
          )}

          {/* Search Queries Card */}
          <Card className="!p-6">
            <div className="flex items-center gap-3 mb-1">
              <Check size={18} className="text-accent" />
              <h2 className="font-semibold">Search queries we&apos;ll use to find leads</h2>
            </div>
            <p className="text-sm text-white/40 mb-6 ml-7">
              You can add or remove any of these before we start crawling.
            </p>

            <div className="space-y-6">
              <KeywordSection
                label="Reddit Global Queries"
                icon={<Search size={14} className="text-white/40" />}
                description="Search across all of Reddit"
                items={redditGlobal}
                inputValue={rgInput}
                onInputChange={setRgInput}
                onAdd={() => addToList(rgInput, redditGlobal, setRedditGlobal, setRgInput)}
                onRemove={(v) => removeFromList(v, redditGlobal, setRedditGlobal)}
                placeholder="Add a search query..."
              />

              <KeywordSection
                label="Target Subreddits"
                icon={<Hash size={14} className="text-white/40" />}
                description="Communities where your buyers hang out"
                items={subreddits}
                inputValue={subInput}
                onInputChange={setSubInput}
                onAdd={() => addToList(subInput, subreddits, setSubreddits, setSubInput)}
                onRemove={(v) => removeFromList(v, subreddits, setSubreddits)}
                placeholder="e.g., sales, Entrepreneur"
                tagPrefix="r/"
              />

              <KeywordSection
                label="Subreddit-Specific Queries"
                icon={<Search size={14} className="text-white/40" />}
                description="Search terms within the target subreddits"
                items={redditSubreddit}
                inputValue={rsInput}
                onInputChange={setRsInput}
                onAdd={() => addToList(rsInput, redditSubreddit, setRedditSubreddit, setRsInput)}
                onRemove={(v) => removeFromList(v, redditSubreddit, setRedditSubreddit)}
                placeholder="Add a query..."
              />

              {/* HN section */}
              <div className="relative">
                <KeywordSection
                  label="Hacker News Queries"
                  icon={<HNIcon size={14} className="text-white/40" />}
                  description="Search Hacker News discussions"
                  items={hackernews}
                  inputValue={hnInput}
                  onInputChange={setHnInput}
                  onAdd={() => addToList(hnInput, hackernews, setHackernews, setHnInput)}
                  onRemove={(v) => removeFromList(v, hackernews, setHackernews)}
                  placeholder="Add a query..."
                  disabled={!can("hackernews")}
                />
                {!can("hackernews") && (
                  <div className="absolute inset-0 bg-bg-primary/60 backdrop-blur-sm rounded-xl flex items-center justify-center">
                    <div className="text-center">
                      <Lock size={20} className="mx-auto mb-2 text-white/30" />
                      <p className="text-sm text-white/40">
                        Requires Pro plan.{" "}
                        <a href="/pricing" className="text-accent hover:text-accent-hover">Upgrade</a>
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* LinkedIn section */}
              <KeywordSection
                label="LinkedIn Queries"
                icon={<Briefcase size={14} className="text-white/40" />}
                description="Search LinkedIn posts and discussions"
                items={linkedin}
                inputValue={liInput}
                onInputChange={setLiInput}
                onAdd={() => addToList(liInput, linkedin, setLinkedin, setLiInput)}
                onRemove={(v) => removeFromList(v, linkedin, setLinkedin)}
                placeholder="Add a query..."
              />
            </div>
          </Card>

          {error && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <Button onClick={handleLaunch} size="lg">
              <Sparkles size={18} />
              Start finding leads
            </Button>
            <Button variant="secondary" size="lg" onClick={() => setStep("describe")}>
              Back
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Launching */}
      {step === "launching" && (
        <Card className="max-w-2xl !p-12 text-center">
          <Loader2 size={32} className="text-accent animate-spin mx-auto mb-4" />
          <h2 className="text-lg font-semibold mb-2">Launching your crawl...</h2>
          <p className="text-sm text-white/40">
            We&apos;re scanning Reddit and Hacker News for people who need your product. This usually takes a minute or two.
          </p>
        </Card>
      )}
    </>
  );
}

function KeywordSection({
  label,
  icon,
  description,
  items,
  inputValue,
  onInputChange,
  onAdd,
  onRemove,
  placeholder,
  disabled = false,
  tagPrefix,
}: {
  label: string;
  icon?: React.ReactNode;
  description: string;
  items: string[];
  inputValue: string;
  onInputChange: (v: string) => void;
  onAdd: () => void;
  onRemove: (v: string) => void;
  placeholder: string;
  disabled?: boolean;
  tagPrefix?: string;
}) {
  return (
    <div>
      <label className="flex items-center gap-2 text-sm font-medium mb-1">
        {icon}
        {label}
        <span className="text-xs text-white/30 font-normal">({items.length})</span>
      </label>
      <p className="text-xs text-white/35 mb-2">{description}</p>
      {items.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {items.map((item) => (
            <span
              key={item}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent/10 text-accent text-sm"
            >
              {tagPrefix}{item}
              <button
                type="button"
                onClick={() => onRemove(item)}
                className="hover:text-white transition-colors"
              >
                <X size={14} />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <Input
          value={inputValue}
          onChange={(e) => onInputChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onAdd();
            }
          }}
        />
        <Button type="button" variant="secondary" onClick={onAdd} disabled={disabled}>
          <Plus size={16} />
        </Button>
      </div>
    </div>
  );
}
