import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Zap, ArrowRight, Play, Search, BarChart3, MessageSquare, Target, TrendingUp } from "lucide-react";

const previewPosts = [
  {
    score: 92,
    title: "Looking for a simple invoicing tool for freelancers",
    meta: "Budget-conscious buyer asking for alternatives",
    source: "Reddit",
    community: "r/freelance",
    time: "2h ago",
    tag: "High Intent",
    strategy: "Reply to the post",
    featured: true,
  },
  {
    score: 85,
    title: "FreshBooks alternative that won't break the bank?",
    meta: "Clear purchase intent with pricing concern",
    source: "Twitter",
    community: "Twitter",
    time: "4h ago",
    tag: "Comparison",
    strategy: "Join the discussion",
  },
  {
    score: 78,
    title: "Switched from Apollo to something better — here's what I learned",
    meta: "Author sharing experience, commenters asking for alternatives",
    source: "LinkedIn",
    community: "LinkedIn",
    time: "5h ago",
    tag: "Target Commenters",
    strategy: "DM the author",
  },
  {
    score: 65,
    title: "Need an easier way to send payment reminders",
    meta: "Pain point identified, solution not chosen yet",
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
    step: "01",
    title: "Describe What You Sell",
    blurb:
      "Add your product, target customer, and a few plain-English pain points. LeadPulse turns that into search angles real buyers actually use.",
    detail: "No complex setup. Just tell the app what problem you solve.",
  },
  {
    step: "02",
    title: "Catch Intent In The Wild",
    blurb:
      "We scan Reddit, Twitter & LinkedIn for posts where people are actively asking, comparing, or struggling with the problem your product solves.",
    detail: "The strongest conversations are scored and surfaced first.",
  },
  {
    step: "03",
    title: "Reply Before The Moment Dies",
    blurb:
      "Get a ranked stream of opportunities with AI-assisted replies that help you sound useful, relevant, and early to the conversation.",
    detail: "Less searching. Better timing. More qualified leads.",
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen">
      {/* Background effects */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-20%] left-[10%] w-[600px] h-[600px] bg-accent/5 rounded-full blur-[150px]" />
        <div className="absolute bottom-[-10%] right-[10%] w-[500px] h-[500px] bg-purple-500/5 rounded-full blur-[120px]" />
      </div>

      {/* Header */}
      <header className="relative z-10 border-b border-border-default">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-accent to-[#22d3ee] flex items-center justify-center">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold">LeadPulse</span>
          </div>

          <nav className="hidden md:flex items-center gap-8">
            <Link href="/pricing" className="text-sm text-text-secondary hover:text-text-primary transition-colors">
              Pricing
            </Link>
            <a href="#features" className="text-sm text-text-secondary hover:text-text-primary transition-colors">
              Features
            </a>
            <a href="#how" className="text-sm text-text-secondary hover:text-text-primary transition-colors">
              How it works
            </a>
          </nav>

          <div className="flex items-center gap-3">
            <Link href="/auth/login" className="text-sm text-text-secondary hover:text-text-primary transition-colors px-4 py-2">
              Log in
            </Link>
            <Link href="/auth/signup">
              <Button size="sm">Start free</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative z-10 max-w-6xl mx-auto px-6 pt-20 pb-32">
        <div className="text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass text-sm mb-8 animate-fade-in">
            <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
            <span className="text-text-secondary">Now scanning Reddit, Twitter & LinkedIn</span>
          </div>

          <h1 className="text-5xl md:text-6xl font-bold leading-tight mb-6 animate-slide-up">
            Find customers who are{" "}
            <span className="gradient-text">already looking</span> for your product
          </h1>

          <p className="text-xl text-text-secondary mb-10 max-w-2xl mx-auto animate-slide-up" style={{ animationDelay: "0.1s" }}>
            LeadPulse scans <span className="text-orange-500 font-medium">Reddit</span>, <span className="text-sky-500 font-medium">Twitter</span> & <span className="text-blue-600 font-medium">LinkedIn</span> to find people actively searching for what you sell — scores them by buying intent, and crafts <span className="text-accent font-medium">AI-powered replies</span> so you can respond in seconds before anyone else.
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

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-slide-up" style={{ animationDelay: "0.2s" }}>
            <Link href="/auth/signup">
              <Button size="lg">
                Start finding leads
                <ArrowRight className="w-5 h-5" />
              </Button>
            </Link>
            <Button variant="secondary" size="lg">
              <Play className="w-5 h-5" />
              Watch demo
            </Button>
          </div>

          <p className="text-sm text-text-tertiary mt-6">Free plan available &middot; No credit card required</p>
        </div>

        {/* Product preview */}
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
              <div className="px-6 pt-5 pb-3 border-b border-border-default bg-gradient-to-r from-accent/[0.06] via-transparent to-transparent">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div>
                    <div className="text-xs uppercase tracking-[0.24em] text-accent/80 mb-2">
                      Live discovery snapshot
                    </div>
                    <div className="text-lg font-semibold text-white">47 leads found this week</div>
                    <div className="text-sm text-text-tertiary">
                      Ranked by purchase intent, source quality, and recency
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-left">
                    {[
                      { label: "Hot", value: "12" },
                      { label: "Ready", value: "8" },
                      { label: "New", value: "19" },
                    ].map((stat) => (
                      <div key={stat.label} className="rounded-xl border border-border-default bg-bg-muted px-3 py-2">
                        <div className="text-[11px] uppercase tracking-wide text-text-tertiary">{stat.label}</div>
                        <div className="text-base font-semibold text-white">{stat.value}</div>
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
                        ? "bg-gradient-to-r from-accent/10 via-white/[0.04] to-transparent border-accent/20 shadow-[0_12px_40px_-20px_rgba(22,163,74,0.35)]"
                        : "bg-bg-muted border-border-default"
                    }`}
                  >
                    <div
                      className={`px-3 py-1 rounded-full text-xs font-bold ${
                        post.score >= 80
                          ? "bg-red-500/20 text-red-400"
                          : post.score >= 50
                            ? "bg-green-500/20 text-green-400"
                            : "bg-amber-500/20 text-amber-400"
                      }`}
                    >
                      {post.score >= 80 ? "Hot" : post.score >= 50 ? "Good" : "Watch"} {post.score}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1.5">
                        <span className="text-[11px] uppercase tracking-wide text-accent">{post.tag}</span>
                        <span className="text-text-tertiary">&middot;</span>
                        <span className={`text-[11px] font-medium ${
                          post.source === "Reddit" ? "text-orange-400" : post.source === "LinkedIn" ? "text-blue-400" : "text-amber-400"
                        }`}>
                          {post.community}
                        </span>
                        <span className="text-text-tertiary">&middot;</span>
                        <span className="text-[11px] text-text-tertiary">{post.time}</span>
                      </div>
                      <div className="text-sm font-medium text-text-primary mb-1">{post.title}</div>
                      <div className="text-xs text-text-tertiary mb-1.5">{post.meta}</div>
                      <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/[0.07] border border-amber-500/15 w-fit">
                        <span className="text-[10px] text-amber-300/80">{post.strategy}</span>
                      </div>
                    </div>
                    {post.featured && (
                      <button className="shrink-0 rounded-xl border border-accent/20 bg-accent/10 px-3 py-2 text-xs font-medium text-accent hover:bg-accent/15">
                        Generate reply
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
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

      {/* How it works */}
      <section id="how" className="relative z-10 py-20 border-t border-border-default overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute left-[8%] top-16 h-56 w-56 rounded-full bg-accent/[0.05] blur-[110px]" />
          <div className="absolute right-[10%] bottom-10 h-64 w-64 rounded-full bg-cyan-400/[0.05] blur-[120px]" />
        </div>
        <div className="relative max-w-6xl mx-auto px-6">
          <div className="max-w-3xl mb-14">
            <div className="inline-flex items-center gap-2 rounded-full border border-border-default bg-bg-muted px-4 py-2 text-xs uppercase tracking-[0.22em] text-text-secondary mb-5">
              How it works
            </div>
            <h2 className="text-4xl md:text-5xl font-bold leading-tight mb-5">
              From vague demand to{" "}
              <span className="gradient-text">actionable buyer signals</span>
            </h2>
            <p className="text-text-secondary text-base leading-7 max-w-2xl">
              Most teams waste hours digging through communities manually. LeadPulse turns that chaos into a simple workflow you can run every day.
            </p>
          </div>

          {/* Timeline */}
          <div className="relative">
            {/* Vertical line */}
            <div className="absolute left-[27px] top-0 bottom-0 w-px bg-gradient-to-b from-accent/40 via-accent/20 to-transparent hidden md:block" />

            <div className="space-y-12 md:space-y-16">
              {howItWorks.map((item, idx) => (
                <div key={item.step} className="relative flex gap-8 md:gap-12 items-start">
                  {/* Timeline node */}
                  <div className="hidden md:flex flex-col items-center shrink-0">
                    <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-lg font-bold border-2 bg-accent/15 border-accent/40 text-accent shadow-[0_0_20px_rgba(22,163,74,0.12)]">
                      {item.step}
                    </div>
                    {idx < howItWorks.length - 1 && (
                      <div className="w-px h-full bg-gradient-to-b from-white/10 to-transparent mt-3" />
                    )}
                  </div>

                  {/* Content card */}
                  <div className="flex-1 relative overflow-hidden rounded-2xl border border-border-default bg-bg-secondary p-6 group hover:border-border-hover transition-all">
                    <div className="absolute inset-0 opacity-50 bg-gradient-to-br from-accent/[0.06] to-transparent" />
                    <div className="relative">
                      {/* Mobile step number */}
                      <div className="md:hidden inline-flex items-center gap-2 mb-3">
                        <span className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold bg-accent/15 text-accent">
                          {item.step}
                        </span>
                      </div>

                      <h3 className="text-xl font-semibold text-white mb-2">{item.title}</h3>
                      <p className="text-text-secondary leading-relaxed mb-3">{item.blurb}</p>

                      {/* Outcome pill */}
                      <div className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm bg-accent/[0.07] border border-accent/15 text-accent/80">
                        <span className="w-1.5 h-1.5 rounded-full bg-accent" />
                        {item.detail}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative z-10 py-20">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <div className="glass rounded-3xl p-12 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-accent/5 via-transparent to-accent/5" />
            <div className="relative z-10">
              <h2 className="text-3xl font-bold mb-4">Ready to find your next customers?</h2>
              <p className="text-text-secondary mb-8">
                Stop losing customers to competitors who reply first. Start capturing high-intent leads today.
              </p>
              <Link href="/auth/signup">
                <Button size="lg">Start free trial &rarr;</Button>
              </Link>
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
