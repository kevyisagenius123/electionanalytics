import React from 'react';
import { Link } from 'react-router-dom';
import Map3D from '../components/Map3D';

const Map3DPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-slate-950">
      {/* Header */}
      <header className="px-6 py-4 flex items-center justify-between border-b border-slate-800/70 bg-[#0f1115]">
        <Link to="/" className="flex items-center gap-2 text-sm font-semibold tracking-wide">
          <span className="inline-flex items-center justify-center w-8 h-8 rounded-md bg-gradient-to-br from-indigo-600 to-sky-600 text-white text-[13px] font-semibold">EE</span>
          <span className="text-sm font-medium tracking-wide text-slate-200">Election Engine</span>
        </Link>
        <div className="flex items-center gap-3">
          <Link to="/" className="text-sm text-slate-400 hover:text-slate-200 transition-colors">
            ← Back to Home
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <div className="w-full h-[calc(100vh-73px)]">
        <Map3D 
          year={2024} 
          mode="results"
          showCongressionalDistricts={false}
        />
      </div>
    </div>
  );
};

export default Map3DPage;
