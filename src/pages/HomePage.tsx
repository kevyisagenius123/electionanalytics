import React, { useEffect } from 'react';
import SiteHeader from '../components/SiteHeader';
import PortalBottomBar from '../components/PortalBottomBar';
import { PORTAL_BRAND, PORTAL_TAGLINE, PORTAL_ACCENT } from '../config/portalTheme';

// Sleek dark premium homepage with glassy hero, crisp CTAs, and feature links
const HomePage: React.FC = () => {
  // Ensure dark mode is enabled for a consistent premium look
  useEffect(() => {
    try {
      const root = document.documentElement;
      if (!root.classList.contains('dark')) root.classList.add('dark');
      localStorage.setItem('portal-dark-mode', 'true');
    } catch {}
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100 font-sans">
      <SiteHeader />
      {/* Hero with gradient background */}
      <section className="relative w-full overflow-hidden">
        <div className="absolute inset-0">
          {/* animated gradient background instead of video */}
          <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900"></div>
          {/* layered gradients for visual interest */}
          <div className="absolute inset-0 bg-[radial-gradient(60%_60%_at_10%_10%,#0ea5e9_0%,transparent_60%),radial-gradient(50%_50%_at_90%_20%,#6366f1_0%,transparent_55%),radial-gradient(60%_60%_at_20%_90%,#22d3ee_0%,transparent_60%)] opacity-20" />
          <div className="absolute inset-0 bg-[conic-gradient(from_220deg,rgba(255,255,255,0.08),transparent_30%,rgba(255,255,255,0.08))] opacity-30" />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(2,6,23,0.6) 0%, rgba(2,6,23,0.9) 65%, rgba(2,6,23,1) 100%)' }} />
        </div>
        <div className="relative max-w-6xl mx-auto px-6 md:px-10 py-16 md:py-24 flex flex-col md:flex-row items-start md:items-center gap-10">
          <div className="flex-1">
            <div className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-full text-[11px] font-medium bg-white/5 border border-white/10 backdrop-blur-sm text-slate-200">
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: PORTAL_ACCENT }} /> New: 3D Rust Belt Swingometer
            </div>
            <h1 className="mt-4 text-4xl md:text-5xl font-semibold tracking-tight leading-[1.15]">
              {PORTAL_BRAND}
            </h1>
            <p className="mt-5 max-w-2xl text-[15px] md:text-[16px] leading-relaxed text-slate-300">
              {PORTAL_TAGLINE}
            </p>
            <div className="mt-8 flex flex-wrap gap-3 text-[13px]">
              <a href="/rustbelt-swing-3d" className="px-5 py-2.5 rounded-md font-medium text-white shadow-sm hover:shadow transition-all border border-sky-500/30" style={{ backgroundColor: PORTAL_ACCENT }}>Explore Rust Belt 3D</a>
              <a href="/us-2024-deck" className="px-5 py-2.5 rounded-md font-medium bg-white/10 text-white border border-white/15 hover:bg-white/15 backdrop-blur-sm transition-colors">2024 Deck Map</a>
              <a href="/projection-demo" className="px-5 py-2.5 rounded-md font-medium bg-white/5 text-white border border-white/10 hover:bg-white/10 transition-colors">Projection Sandbox</a>
            </div>
            <div className="mt-6 flex flex-wrap gap-2 text-[11px] text-slate-300">
              <span className="px-2 py-1 rounded bg-white/5 border border-white/10">Iowa-parity math</span>
              <span className="px-2 py-1 rounded bg-white/5 border border-white/10">2016 / 2020 / 2024 baselines</span>
              <span className="px-2 py-1 rounded bg-white/5 border border-white/10">Margin + turnout extrusion</span>
            </div>
          </div>
          {/* Preview removed per request – hero now single-column on mobile and simpler on desktop */}
        </div>
      </section>

      {/* Feature links */}
      <section className="w-full py-10 md:py-14">
        <div className="max-w-6xl mx-auto px-6 md:px-10">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
            <FeatureCard title="Texas Advanced Simulation" href="/texas-sim-advanced" desc="Ultra-realistic DeckGL simulation with probabilistic modeling." />
            <FeatureCard title="Rust Belt 3D Swingometer" href="/rustbelt-swing-3d" desc="Iowa-parity math with solver and scope switching." />
            <FeatureCard title="2024 Deck Map" href="/us-2024-deck" desc="Margin-based colors, smooth transitions, tooltips." />
            <FeatureCard title="Projection Sandbox" href="/projection-demo" desc="Play with scenarios and visual layers." />
            <FeatureCard title="Iowa Scenario" href="/iowa-scenario" desc="Baseline controls and parity math reference." />
            <FeatureCard title="Canada Election" href="/canada-election" desc="Explore Canadian ridings and results." />
            <FeatureCard title="Dashboard" href="/dashboard" desc="Key demos, charts and quick links." />
          </div>
        </div>
      </section>

      {/* Footer / Meta */}
      <section className="w-full mt-auto">
        <div className="max-w-6xl mx-auto px-6 md:px-10 py-10 text-[12px] text-slate-400">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <a className="hover:text-slate-200" href="#trust">Methodology</a>
            <a className="hover:text-slate-200" href="#licensing">Licensing</a>
            <a className="hover:text-slate-200" href="#integrity">Integrity</a>
            <a className="hover:text-slate-200" href="#contact">Contact</a>
          </div>
        </div>
        <PortalBottomBar />
      </section>
    </div>
  );
};

export default HomePage;

// Small card component for feature links
const FeatureCard: React.FC<{ title: string; desc: string; href: string }> = ({ title, desc, href }) => (
  <a href={href} className="group rounded-xl p-4 bg-white/5 border border-white/10 hover:bg-white/[0.08] transition-colors backdrop-blur-sm">
    <div className="flex items-start gap-3">
      <div className="mt-0.5 w-2 h-2 rounded-full" style={{ backgroundColor: PORTAL_ACCENT }} />
      <div>
        <div className="font-semibold text-slate-100 group-hover:text-white">{title}</div>
        <div className="mt-1 text-[12px] text-slate-400">{desc}</div>
      </div>
    </div>
  </a>
);


