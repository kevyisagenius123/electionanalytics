import React from 'react';
import { Link } from 'react-router-dom';
import MegaMenu from './MegaMenu';

// SiteHeader wraps brand + mega menu + utility actions.

const SiteHeader: React.FC = () => {
  return (
  <header className="px-6 py-4 flex items-center justify-between border-b border-slate-800/70 bg-[#0f1115]">
      <Link to="/" className="flex items-center gap-2 text-sm font-semibold tracking-wide focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60 rounded-md">
        <span className="inline-flex items-center justify-center w-8 h-8 rounded-md bg-gradient-to-br from-indigo-600 to-sky-600 text-white text-[13px] font-semibold tracking-wide">EE</span>
        <span className="text-sm font-medium tracking-wide text-slate-200">Election Engine</span>
      </Link>
      <div className="hidden lg:block flex-1 mx-10">
        <MegaMenu />
      </div>
      <div className="flex items-center gap-2.5">
        <a
          href="https://github.com"
          target="_blank"
          rel="noreferrer"
          className="text-[11px] px-3 py-1.5 rounded-md bg-slate-800/60 border border-slate-700/70 hover:bg-slate-700/70 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60"
        >
          GitHub
        </a>
        <Link
          to="/projection-demo"
          className="text-[11px] px-3 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-500 shadow-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60"
        >
          Launch
        </Link>
      </div>
    </header>
  );
};

export default SiteHeader;
