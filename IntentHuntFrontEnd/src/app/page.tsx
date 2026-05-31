import Link from "next/link";
import { Fragment } from "react";
import { Button } from "@/components/ui/button";
import { HeaderAuthCTA, HeroAuthCTA, FinalAuthCTA, LandingLogoLink } from "@/components/landing/AuthCTAs";
import { Zap, Search, BarChart3, MessageSquare, Target, TrendingUp, Check, X, Send, Inbox, Bell, Sparkles } from "lucide-react";

const previewPosts = [
  {
    score: 92,
    title: "What's your favorite lead-gen tool right now? Apollo too expensive",
    meta: "Active buyer + pricing objection — strong fit",
    source: "Reddit",
    community: "r/sales",
    time: "2h ago",
    tag: "High Intent",
    strategy: "Reply to the post",
    featured: true,
  },
  {
    score: 85,
    title: "Best Clay alternatives for solo founders?",
    meta: "Comparison shopping, budget-conscious",
    source: "Twitter",
    community: "Twitter",
    time: "4h ago",
    tag: "Comparison",
    strategy: "Join the discussion",
  },
  {
    score: 78,
    title: "Just switched from Apollo to a leaner stack — sharing what worked",
    meta: "Commenters asking what to switch to",
    source: "LinkedIn",
    community: "LinkedIn",
    time: "5h ago",
    tag: "Target Commenters",
    strategy: "DM the author",
  },
  {
    score: 65,
    title: "Need a way to find buyers outside of LinkedIn — any tool recs?",
    meta: "Pain point identified, no solution yet",
    source: "Reddit",
    community: "r/Entrepreneur",
    time: "7h ago",
    tag: "Pain Point",
    strategy: "Share as a resource",
  },
];

const platforms = [
  { name: "Reddit", color: "from-orange-500 to-red-500", posts: "2M+ posts scanned" },
  { name: "Twitter", color: "from-sky-400 to-blue-500", posts: "500K+ discussions" },
  { name: "LinkedIn", color: "from-blue-500 to-blue-600", posts: "1M+ professional posts" },
];

const features = [
  {
    icon: Search,
    title: "Smart Discovery",
    desc: "AI expands your search beyond obvious keywords and surfaces hidden demand across communities.",
    eyebrow: "Find the right conversations",
  },
  {
    icon: BarChart3,
    title: "Intent Scoring",
    desc: "Each post gets ranked so your team knows which conversations deserve attention first.",
    eyebrow: "Prioritize with confidence",
  },
  {
    icon: MessageSquare,
    title: "AI Replies",
    desc: "Generate replies that sound useful and human instead of robotic or spammy.",
    eyebrow: "Respond without sounding fake",
  },
  {
    icon: Zap,
    title: "Real-time Crawling",
    desc: "Catch fresh posts while the buyer is still looking, not after the thread is already dead.",
    eyebrow: "Move while intent is fresh",
  },
  {
    icon: Target,
    title: "Multi-Product Tracking",
    desc: "Watch multiple offers, audiences, and problem spaces from one place without mixing signals.",
    eyebrow: "Scale beyond one niche",
  },
  {
    icon: TrendingUp,
    title: "Signal Analytics",
    desc: "See which sources, keywords, and conversation types turn into your best opportunities.",
    eyebrow: "Learn what actually converts",
  },
];

const howItWorks = [
  {
    step:  "Step 1",
    title: "Tell us what you sell",
    blurb: "Add your product, target customer, and the problems you solve. LeadPulse turns that into search angles real buyers use.",
    icon:  MessageSquare,
  },
  {
    step:  "Step 2",
    title: "We scan in real-time",
    blurb: "Reddit, LinkedIn & Twitter get scanned for posts where people are actively asking, comparing, or struggling.",
    icon:  Search,
  },
  {
    step:  "Step 3",
    title: "Reply in seconds",
    blurb: "Get a ranked stream of opportunities with AI-personalized DMs and comments — context-aware, ready to ship.",
    icon:  Send,
  },
];

// ── Mini mockups used inside "How it works" cards ──────────────────────────

function Step1Visual() {
  return (
    <div className="h-full flex flex-col justify-center max-w-[90%] mx-auto">
      <div className="flex items-center gap-1.5 mb-1.5 text-[9px] font-semibold uppercase tracking-wider text-text-tertiary">
        <Sparkles size={9} className="text-accent" strokeWidth={2.5} />
        Product description
      </div>
      <div className="rounded-lg bg-bg-secondary border border-border-default px-2.5 py-2 shadow-sm">
        <p className="text-[11px] text-text-primary leading-relaxed">
          AI lead-gen tool for B2B SaaS founders
          <span className="inline-block w-[1.5px] h-3 bg-accent ml-0.5 align-middle animate-pulse" />
        </p>
      </div>
    </div>
  );
}

function Step2Visual() {
  const platforms = [
    { name: "Reddit",   dot: "bg-orange-500" },
    { name: "LinkedIn", dot: "bg-blue-600"   },
    { name: "Twitter",  dot: "bg-sky-500"    },
  ];
  return (
    <div className="h-full flex flex-col justify-center max-w-[90%] mx-auto space-y-1">
      {platforms.map((p) => (
        <div
          key={p.name}
          className="flex items-center justify-between px-2 py-1 rounded-md bg-bg-secondary border border-border-default shadow-sm"
        >
          <span className="flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full ${p.dot}`} />
            <span className="text-[10px] font-medium text-text-primary">{p.name}</span>
          </span>
          <span className="text-[8px] text-accent font-semibold flex items-center gap-1">
            <span className="w-1 h-1 rounded-full bg-accent animate-pulse" />
            scanning
          </span>
        </div>
      ))}
    </div>
  );
}

function Step3Visual() {
  return (
    <div className="h-full flex flex-col justify-center max-w-[92%] mx-auto">
      <div className="rounded-lg bg-bg-secondary border border-border-default px-2.5 py-2 mb-1.5 shadow-sm">
        <div className="text-[8px] uppercase tracking-wider text-text-tertiary mb-0.5 font-semibold">
          To · u/sarah_designs
        </div>
        <p className="text-[10px] text-text-primary leading-snug">
          Hey Sarah — feel you on FreshBooks being overkill. The Stripe + late-fee combo…
        </p>
      </div>
      <div className="flex justify-end">
        <button className="inline-flex items-center gap-1 text-[9px] font-bold px-2 py-1 rounded-md bg-accent text-white shadow">
          Send DM
          <Send size={9} strokeWidth={3} />
        </button>
      </div>
    </div>
  );
}

export default function LandingPage() {
  return (
    <div className="min-h-screen">
      {/* Background effects */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-20%] left-[10%] w-[600px] h-[600px] bg-accent/5 rounded-full blur-[150px]" />
        <div className="absolute bottom-[-10%] right-[10%] w-[500px] h-[500px] bg-cyan-400/5 rounded-full blur-[120px]" />
      </div>

      {/* Header */}
      <header className="relative z-10 border-b border-border-default">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <LandingLogoLink>
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-accent to-[#22d3ee] flex items-center justify-center">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold">LeadPulse</span>
          </LandingLogoLink>

          <nav className="hidden md:flex items-center gap-8">
            <Link href="/pricing" className="text-sm text-text-secondary hover:text-text-primary transition-colors">
              Pricing
            </Link>
            <a href="#how" className="text-sm text-text-secondary hover:text-text-primary transition-colors">
              How it works
            </a>
          </nav>

          <HeaderAuthCTA />
        </div>
      </header>

      {/* Hero */}
      <section className="relative z-10 max-w-6xl mx-auto px-6 pt-20 pb-32">
        <div className="text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass text-sm mb-8 animate-fade-in">
            <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
            <span className="text-text-secondary">Scanning Reddit, LinkedIn &amp; Twitter — live</span>
          </div>

          <h1 className="text-5xl md:text-6xl font-bold leading-tight mb-6 animate-slide-up">
            Find people <span className="gradient-text">asking</span> about what you sell
          </h1>

          <p className="text-xl text-text-secondary mb-10 max-w-2xl mx-auto animate-slide-up" style={{ animationDelay: "0.1s" }}>
            Across <span className="text-orange-600 font-semibold">Reddit</span>, <span className="text-blue-600 font-semibold">LinkedIn</span> &amp; <span className="text-sky-600 font-semibold">Twitter</span>, LeadPulse surfaces buying-intent posts, scores them, and writes a personalized DM in seconds — so you can reply before anyone else.
          </p>

          {/* Platform badges */}
          <div className="flex items-center justify-center gap-3 mb-10 animate-slide-up" style={{ animationDelay: "0.15s" }}>
            {platforms.map((p) => (
              <div key={p.name} className="flex items-center gap-2 px-4 py-2 rounded-xl glass border border-border-default">
                <div className={`w-2 h-2 rounded-full bg-gradient-to-r ${p.color}`} />
                <span className="text-sm font-medium text-text-primary">{p.name}</span>
                <span className="text-[11px] text-text-tertiary">{p.posts}</span>
              </div>
            ))}
          </div>

          <HeroAuthCTA />
        </div>

        {/* ════════════════════════════════════════════════════════════════
            🎬  SWAP ME — replace this product-preview mockup with a YouTube
            demo video when ready. The <VideoEmbed /> scaffold sits right
            below this block — uncomment it and delete this whole
            "Product preview" div. Search: "SWAP ME"
            ════════════════════════════════════════════════════════════════ */}

        {/* Product preview (placeholder mockup — to be swapped for demo video) */}
        <div className="mt-20 relative animate-float">
          <div className="absolute inset-0 bg-gradient-to-t from-bg-primary via-transparent to-transparent z-10 pointer-events-none" />
          <div className="glass rounded-2xl p-1 max-w-4xl mx-auto">
            <div className="bg-bg-secondary rounded-xl overflow-hidden">
              {/* Browser bar */}
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border-default">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-bg-muted" />
                  <div className="w-3 h-3 rounded-full bg-bg-muted" />
                  <div className="w-3 h-3 rounded-full bg-bg-muted" />
                </div>
                <div className="flex-1 flex justify-center">
                  <div className="px-4 py-1 rounded-lg bg-bg-muted text-xs text-text-tertiary">
                    app.leadpulse.io/gold-posts
                  </div>
                </div>
              </div>

              {/* Stats bar */}
              <div className="px-6 pt-5 pb-3 border-b border-border-default bg-accent-soft/40">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div>
                    <div className="text-xs uppercase tracking-[0.24em] text-accent mb-2 font-semibold">
                      Live discovery snapshot
                    </div>
                    <div className="text-lg font-semibold text-text-primary">47 leads found this week</div>
                    <div className="text-sm text-text-secondary">
                      Ranked by purchase intent, source quality, and recency
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-left">
                    {[
                      { label: "Hot", value: "12" },
                      { label: "Ready", value: "8" },
                      { label: "New", value: "19" },
                    ].map((stat) => (
                      <div key={stat.label} className="rounded-xl border border-border-default bg-bg-secondary px-3 py-2">
                        <div className="text-[11px] uppercase tracking-wide text-text-tertiary">{stat.label}</div>
                        <div className="text-base font-semibold text-text-primary">{stat.value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Posts */}
              <div className="p-6 space-y-3">
                {previewPosts.map((post, i) => (
                  <div
                    key={i}
                    className={`flex items-start gap-4 p-4 rounded-2xl border transition-all ${
                      post.featured
                        ? "bg-accent-soft border-accent/30 shadow-[0_12px_40px_-20px_rgba(22,163,74,0.25)]"
                        : "bg-bg-secondary border-border-default"
                    }`}
                  >
                    <div
                      className={`px-3 py-1 rounded-full text-xs font-bold shrink-0 ${
                        post.score >= 80
                          ? "bg-red-100 text-red-700"
                          : post.score >= 50
                            ? "bg-green-100 text-green-700"
                            : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {post.score >= 80 ? "Hot" : post.score >= 50 ? "Good" : "Watch"} {post.score}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1.5">
                        <span className="text-[11px] uppercase tracking-wide font-semibold text-accent">{post.tag}</span>
                        <span className="text-text-tertiary">&middot;</span>
                        <span className={`text-[11px] font-medium ${
                          post.source === "Reddit" ? "text-orange-600" : post.source === "LinkedIn" ? "text-blue-600" : "text-sky-600"
                        }`}>
                          {post.community}
                        </span>
                        <span className="text-text-tertiary">&middot;</span>
                        <span className="text-[11px] text-text-tertiary">{post.time}</span>
                      </div>
                      <div className="text-sm font-semibold text-text-primary mb-1">{post.title}</div>
                      <div className="text-xs text-text-secondary mb-2">{post.meta}</div>
                      <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-50 border border-amber-200 w-fit">
                        <span className="text-[10px] font-medium text-amber-700">{post.strategy}</span>
                      </div>
                    </div>
                    {post.featured && (
                      <button className="shrink-0 rounded-xl bg-accent px-3 py-2 text-xs font-semibold text-white hover:bg-accent-hover transition-colors">
                        Generate reply
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ════════════════════════════════════════════════════════════════
            🎬  YOUTUBE DEMO VIDEO — SWAP ME
            ────────────────────────────────────────────────────────────────
            When the demo video is ready:
              1. Replace YOUR_VIDEO_ID below with your actual YouTube video ID
              2. Set `false` to `true` on the {false && (...)} below
              3. Delete the "Product preview" mockup block above this one
                 (the one with the browser bar + sample posts)
            The aspect ratio + max-width match the current mockup, so the
            page layout stays identical after the swap.
            ════════════════════════════════════════════════════════════════ */}
        {false && (
        <div className="mt-20 relative animate-float">
          <div className="glass rounded-2xl p-1 max-w-4xl mx-auto">
            <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-bg-secondary">
              <iframe
                src="https://www.youtube.com/embed/YOUR_VIDEO_ID"
                title="LeadPulse demo"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope"
                allowFullScreen
                className="absolute inset-0 w-full h-full"
              />
            </div>
          </div>
        </div>
        )}
      </section>

      {/* Get the hottest leads in seconds (split: copy left, inbox mockup right) */}
      <section className="relative z-10 py-20 border-t border-border-default">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid lg:grid-cols-[0.9fr_1.1fr] gap-12 items-center">
            {/* Copy */}
            <div>
              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border-default bg-bg-secondary text-xs font-semibold text-text-secondary mb-5">
                <Bell size={13} className="text-accent" />
                Get leads
              </span>
              <h2 className="text-4xl md:text-5xl font-bold leading-tight mb-5 text-text-primary">
                Get the hottest leads in <span className="gradient-text">seconds</span>
              </h2>
              <p className="text-lg text-text-secondary leading-relaxed mb-6">
                LeadPulse uses AI to understand each post and the person behind it. You get a ranked inbox — newest, hottest, and ready-to-reply leads at the top.
              </p>
              <ul className="space-y-3 text-sm">
                {[
                  "Live realtime inbox — new leads land in seconds",
                  "Filter by status, platform, and relevancy",
                  "Full control over how AI scores and writes replies",
                ].map((line) => (
                  <li key={line} className="flex items-start gap-2.5">
                    <Check size={16} strokeWidth={3} className="text-accent shrink-0 mt-0.5" />
                    <span className="text-text-secondary">{line}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Inbox mockup */}
            <div className="rounded-2xl border border-border-default bg-bg-secondary shadow-xl overflow-hidden">
              <div className="grid grid-cols-[160px_1fr]">
                {/* Sidebar */}
                <div className="bg-bg-primary border-r border-border-default p-3 space-y-4">
                  {/* Avatar */}
                  <div className="flex items-center gap-2 px-1.5 py-1">
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-accent to-cyan-400 flex items-center justify-center text-white text-xs font-bold">
                      H
                    </div>
                  </div>

                  {/* Inbox / Completed */}
                  <div className="space-y-0.5">
                    <button className="w-full flex items-center justify-between px-2 py-1.5 rounded-md text-xs font-medium bg-accent-soft text-accent">
                      <span className="flex items-center gap-1.5">
                        <Inbox size={12} />
                        Inbox
                      </span>
                      <span className="text-[10px]">7</span>
                    </button>
                    <button className="w-full flex items-center px-2 py-1.5 rounded-md text-xs text-text-tertiary hover:bg-bg-card-hover">
                      <Check size={12} className="mr-1.5" strokeWidth={2.5} />
                      Completed
                    </button>
                  </div>

                  {/* Filter by platform */}
                  <div>
                    <div className="text-[9px] font-semibold uppercase tracking-wider text-text-tertiary mb-1.5 px-2">
                      Filter by platform
                    </div>
                    <div className="space-y-0.5">
                      {[
                        { name: "Reddit",   count: 4, dot: "bg-orange-500"      },
                        { name: "LinkedIn", count: 2, dot: "bg-blue-600"        },
                        { name: "Twitter",  count: 1, dot: "bg-sky-500"         },
                      ].map((p) => (
                        <div key={p.name} className="flex items-center justify-between px-2 py-1.5 text-xs text-text-secondary">
                          <span className="flex items-center gap-1.5">
                            <span className={`w-1.5 h-1.5 rounded-full ${p.dot}`} />
                            {p.name}
                          </span>
                          {p.count > 0 && (
                            <span className="text-[10px] tabular-nums bg-accent-soft text-accent px-1.5 rounded-full font-semibold">
                              {p.count}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Lead list */}
                <div>
                  <div className="px-5 py-4 border-b border-border-default">
                    <h3 className="font-bold text-text-primary">New leads</h3>
                  </div>
                  <div className="divide-y divide-border-default">
                    {[
                      { user: "u/markets_guy",  when: "3 hr ago",   title: "What lead gen tool do you actually use day-to-day?",        src: "r/sales",         dot: "bg-orange-500", color: "from-orange-400 to-red-400"   },
                      { user: "Sarah K.",       when: "1 day ago",  title: "Switched from Apollo — what's your lead stack now?",       src: "LinkedIn post",   dot: "bg-blue-600",   color: "from-blue-400 to-cyan-400"    },
                      { user: "@daviddraws",    when: "2 days ago", title: "Looking for a tool that finds leads on Reddit 🙃",          src: "Twitter",         dot: "bg-sky-500",    color: "from-sky-400 to-blue-400"     },
                      { user: "u/coldcaller",   when: "5 days ago", title: "Best Clay alternatives for finding outbound leads?",        src: "r/sales",         dot: "bg-orange-500", color: "from-emerald-400 to-teal-400" },
                      { user: "u/soloFounder",  when: "1 week ago", title: "Any lead finder under $50/mo that doesn't suck?",           src: "r/Entrepreneur",  dot: "bg-orange-500", color: "from-amber-400 to-orange-400" },
                    ].map((row, i) => (
                      <div key={i} className="px-5 py-3">
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className={`w-3 h-3 rounded-full bg-gradient-to-br ${row.color} shrink-0`} />
                            <span className="text-[11px] font-medium text-text-secondary truncate">{row.user}</span>
                            <span className="text-[10px] text-text-tertiary">·</span>
                            <span className="inline-flex items-center gap-1 text-[10px] text-text-tertiary shrink-0">
                              <span className={`w-1 h-1 rounded-full ${row.dot}`} />
                              {row.src}
                            </span>
                          </div>
                          <span className="text-[10px] text-text-tertiary shrink-0 ml-2">{row.when}</span>
                        </div>
                        <div className="text-sm text-text-primary leading-snug">{row.title}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="relative z-10 py-20 border-t border-border-default overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute left-[8%] top-16 h-56 w-56 rounded-full bg-accent/[0.05] blur-[110px]" />
          <div className="absolute right-[10%] bottom-10 h-64 w-64 rounded-full bg-cyan-400/[0.05] blur-[120px]" />
        </div>
        <div className="relative max-w-6xl mx-auto px-6">
          <div className="text-center max-w-3xl mx-auto mb-14">
            <h2 className="text-4xl md:text-5xl font-bold leading-tight mb-5">
              From vague demand to{" "}
              <span className="gradient-text">actionable buyer signals</span>
            </h2>
            <p className="text-text-secondary text-base leading-7 mx-auto">
              Most teams waste hours digging through communities manually. LeadPulse turns that chaos into a simple 3-step workflow.
            </p>
          </div>

          {/* 3-card horizontal grid */}
          <div className="grid md:grid-cols-3 gap-5">
            {howItWorks.map((item, i) => (
              <div
                key={item.step}
                className="rounded-2xl border border-border-default bg-bg-secondary p-7 flex flex-col"
              >
                <span className="inline-flex w-fit items-center px-2.5 py-1 rounded-lg bg-bg-muted text-text-secondary text-xs font-semibold mb-5">
                  {item.step}
                </span>
                <h3 className="text-xl font-bold text-text-primary mb-2">
                  {item.title}
                </h3>
                <p className="text-sm text-text-secondary leading-relaxed mb-6 flex-1">
                  {item.blurb}
                </p>

                {/* Visual area — mini product mockup per step */}
                <div className="aspect-[5/3] rounded-xl bg-gradient-to-br from-accent-soft/60 via-bg-muted to-bg-secondary border border-border-default p-3.5 relative overflow-hidden">
                  {/* Subtle decorative accent dots */}
                  <div className="absolute top-2 right-3 w-1 h-1 rounded-full bg-accent/40" />
                  <div className="absolute bottom-3 left-3 w-1 h-1 rounded-full bg-accent/30" />

                  {i === 0 && <Step1Visual />}
                  {i === 1 && <Step2Visual />}
                  {i === 2 && <Step3Visual />}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Before / After reply comparison */}
      <section className="relative z-10 py-20 border-t border-border-default bg-bg-secondary">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent-soft px-4 py-2 text-xs uppercase tracking-[0.22em] text-accent font-semibold mb-5">
              Why it works
            </div>
            <h2 className="text-3xl md:text-4xl font-bold leading-tight mb-4">
              Replies that don&apos;t sound like{" "}
              <span className="gradient-text">AI</span>
            </h2>
            <p className="text-text-secondary max-w-2xl mx-auto">
              Most outreach tools stop at <code className="text-[13px] px-1.5 py-0.5 rounded bg-bg-muted text-text-primary font-mono">{`{{first_name}}`}</code>. LeadPulse reads the exact post and writes a reply that references their problem, not their name.
            </p>
          </div>

          {/* The Reddit post being replied to */}
          <div className="max-w-2xl mx-auto mb-6 rounded-2xl border border-border-default bg-bg-primary p-5">
            <div className="flex items-center gap-2 text-[11px] text-text-tertiary mb-2">
              <span className="font-semibold text-orange-600">r/freelance</span>
              <span>·</span>
              <span>posted 2h ago by /u/sarah_designs</span>
            </div>
            <div className="text-sm font-semibold mb-1.5">Looking for a simple invoicing tool for freelancers</div>
            <div className="text-sm text-text-secondary leading-relaxed">
              Hey all, I&apos;ve been using FreshBooks but it&apos;s overkill for my single-person shop. Just need something that does invoices, late-fee reminders, and accepts Stripe. Open to alternatives under $20/mo.
            </div>
          </div>

          {/* The replies side by side */}
          <div className="grid md:grid-cols-2 gap-5">
            {/* Generic */}
            <div className="rounded-2xl border border-border-default bg-bg-primary p-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 rounded-lg bg-bg-muted flex items-center justify-center">
                  <X size={14} className="text-text-tertiary" />
                </div>
                <span className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
                  Generic outreach tool
                </span>
              </div>
              <p className="text-sm text-text-secondary leading-relaxed">
                Hi <span className="bg-amber-100 text-amber-700 px-1 rounded font-mono text-xs">{`{{first_name}}`}</span>! Saw your post about invoicing. We built <span className="bg-amber-100 text-amber-700 px-1 rounded font-mono text-xs">{`{{product}}`}</span> for freelancers like you. Sign up for a free trial here: <span className="underline">[link]</span>
              </p>
              <div className="mt-4 text-[11px] text-red-700 font-medium">
                Sounds like a bot. Buyer ignores it.
              </div>
            </div>

            {/* LeadPulse */}
            <div className="rounded-2xl border-2 border-accent/30 bg-accent-soft p-5 shadow-[0_12px_40px_-20px_rgba(22,163,74,0.35)]">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 rounded-lg bg-accent flex items-center justify-center">
                  <Check size={14} className="text-white" strokeWidth={3} />
                </div>
                <span className="text-xs font-semibold uppercase tracking-wide text-accent">
                  LeadPulse
                </span>
              </div>
              <p className="text-sm text-text-primary leading-relaxed">
                Hey Sarah — totally feel you on FreshBooks being overkill for a solo shop. The Stripe + late-fee reminder combo is exactly what we built our invoicing flow around. $9/mo, no learning curve. If it&apos;s useful here&apos;s a quick try-it link, otherwise happy to send screenshots.
              </p>
              <div className="mt-4 text-[11px] text-accent font-medium">
                References her exact pain. Reads like a peer.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features — DISABLED. Kept in code; flip `false` to `true` to re-enable. */}
      {false && (
      <section id="features" className="relative z-10 py-20 border-t border-border-default">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid lg:grid-cols-[1.1fr_0.9fr] gap-10 items-end mb-16">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-accent/15 bg-accent/[0.08] px-4 py-2 text-xs uppercase tracking-[0.22em] text-accent mb-5">
                Built for signal, not noise
              </div>
              <h2 className="text-4xl md:text-5xl font-bold leading-tight max-w-3xl">
                Turn scattered conversations into a{" "}
                <span className="gradient-text">repeatable lead engine</span>
              </h2>
            </div>
            <div className="lg:pl-8">
              <p className="text-text-secondary text-base leading-7 max-w-xl">
                LeadPulse helps you discover real buyer intent, rank the best opportunities, and respond with context before competitors even notice the thread.
              </p>
            </div>
          </div>

          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-6">
            {features.map((feature, i) => (
              <div
                key={i}
                className="glass rounded-[24px] p-6 hover:bg-bg-muted transition-all duration-300 group relative overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-accent/[0.08] via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="relative">
                  <div className="w-12 h-12 rounded-2xl bg-bg-muted border border-border-default flex items-center justify-center mb-5 group-hover:border-accent/20 group-hover:bg-accent/10 transition-colors">
                    <feature.icon className="w-6 h-6 text-text-secondary group-hover:text-accent transition-colors" />
                  </div>
                  <div className="text-[11px] uppercase tracking-[0.22em] text-text-tertiary mb-3">
                    {feature.eyebrow}
                  </div>
                  <h3 className="text-xl font-semibold mb-3 group-hover:text-accent transition-colors">
                    {feature.title}
                  </h3>
                  <p className="text-sm leading-6 text-text-secondary">{feature.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
      )}

      {/* Comparison table */}
      <section className="relative z-10 py-20 border-t border-border-default bg-bg-secondary">
        <div className="max-w-4xl mx-auto px-6">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent-soft px-4 py-2 text-xs uppercase tracking-[0.22em] text-accent font-semibold mb-5">
              How we compare
            </div>
            <h2 className="text-3xl md:text-4xl font-bold leading-tight mb-3">
              Why bet your pipeline on one platform?
            </h2>
            <p className="text-text-secondary max-w-2xl mx-auto">
              Most outreach tools cover one community. LeadPulse runs across all three — so when your buyers move, you don&apos;t lose them.
            </p>
          </div>

          <div className="rounded-2xl border border-border-default overflow-hidden bg-bg-primary">
            <div className="grid grid-cols-[1.5fr_1fr_1fr] text-sm">
              {/* Header row */}
              <div className="px-5 py-4 border-b border-border-default font-semibold text-text-secondary">
                Feature
              </div>
              <div className="px-5 py-4 border-b border-l border-border-default text-center">
                <div className="text-xs uppercase tracking-wide text-text-tertiary font-semibold">
                  Other tools
                </div>
              </div>
              <div className="px-5 py-4 border-b border-l border-border-default text-center bg-accent-soft/50">
                <div className="text-xs uppercase tracking-wide text-accent font-bold">
                  LeadPulse
                </div>
              </div>

              {/* Rows */}
              {[
                { feat: "Reddit coverage",                  them: true,  us: true  },
                { feat: "LinkedIn coverage",                 them: false, us: true  },
                { feat: "Twitter / X coverage",              them: false, us: true  },
                { feat: "AI-personalized DMs",               them: true,  us: true  },
                { feat: "Public reply suggestions",          them: false, us: true  },
                { feat: "Intent scoring (Hot / Warm / Cold)", them: false, us: true  },
                { feat: "Multi-product tracking",            them: false, us: true  },
                { feat: "Live realtime inbox",               them: false, us: true  },
              ].map((row, idx, arr) => (
                <Fragment key={row.feat}>
                  <div className={`px-5 py-3.5 text-text-primary ${idx < arr.length - 1 ? "border-b border-border-default" : ""}`}>
                    {row.feat}
                  </div>
                  <div className={`px-5 py-3.5 border-l border-border-default text-center ${idx < arr.length - 1 ? "border-b" : ""}`}>
                    {row.them ? (
                      <Check size={18} strokeWidth={3} className="text-text-tertiary inline" />
                    ) : (
                      <X size={18} strokeWidth={3} className="text-text-tertiary/40 inline" />
                    )}
                  </div>
                  <div className={`px-5 py-3.5 border-l border-border-default text-center bg-accent-soft/30 ${idx < arr.length - 1 ? "border-b" : ""}`}>
                    {row.us ? (
                      <Check size={18} strokeWidth={3} className="text-accent inline" />
                    ) : (
                      <X size={18} strokeWidth={3} className="text-text-tertiary/40 inline" />
                    )}
                  </div>
                </Fragment>
              ))}
            </div>
          </div>

          <p className="text-center text-xs text-text-tertiary mt-5">
            Based on public features of common Reddit-focused outreach tools as of 2026.
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="relative z-10 py-20">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <div className="glass rounded-3xl p-12 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-accent/5 via-transparent to-accent/5" />
            <div className="relative z-10">
              <FinalAuthCTA />
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-border-default py-8">
        <div className="max-w-6xl mx-auto px-6 flex items-center justify-between">
          <p className="text-sm text-text-tertiary">&copy; 2026 LeadPulse</p>
          <div className="flex gap-6 text-sm text-text-tertiary">
            <a href="#" className="hover:text-text-secondary">Privacy</a>
            <a href="#" className="hover:text-text-secondary">Terms</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
