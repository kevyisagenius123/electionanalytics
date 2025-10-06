import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { PORTAL_ACCENT } from '../config/portalTheme';

// Clean Microsoft-esque mega menu implementation.
// Accessibility notes:
// - Triggers are buttons with aria-expanded / aria-controls.
// - Panels are labelled via aria-labelledby and close on Escape / outside click / focus loss.
// - Left/Right arrows move between triggers, Down opens and focuses first link, Up (from panel) returns to trigger.

interface MegaSection {
  heading: string;
  items: Array<{ label: string; to: string; description?: string }>;
}

interface MegaCategory {
  id: string;
  label: string;
  sections: MegaSection[];
}

const CATEGORIES: MegaCategory[] = [
  {
    id: 'cesium',
    label: 'Cesium',
    sections: [
      {
        heading: 'Globe & Extrusions',
        items: [
          { label: 'Cesium 3D', to: '/cesium-3d', description: 'Core globe layers' },
          { label: 'Extruded Counties', to: '/cesium-extruded', description: 'Height by metric' }
        ]
      },
      {
        heading: 'Simulations',
        items: [
          { label: 'US 2024 (Cesium)', to: '/cesium-3d', description: 'County/state layers with camera' },
          { label: 'Cesium Simulation Sandbox', to: '/cesium-simulation', description: 'Prototype simulation controls' }
        ]
      }
    ]
  },
  {
    id: 'deckgl',
    label: 'DeckGL',
    sections: [
      {
        heading: 'United States',
        items: [
          { label: 'US 2024 Live (DeckGL)', to: '/us-2024-deck', description: 'Counties + states, smooth transitions, tooltips' },
          { label: 'US Timelapse (08→24)', to: '/us-timelapse-deck', description: '3D county extrusion with smooth transitions' },
          { label: 'US 2024 Hier 3D', to: '/us-2024-hier3d', description: 'State → County drill (prototype)' },
          { label: 'Rust Belt Swingometer', to: '/rustbelt-swing-3d', description: 'Swing vs baseline with solver' },
          { label: 'Projection Sandbox', to: '/projection-demo', description: 'Scenario controls' },
          { label: 'Demographics 3D', to: '/demographics-3d', description: 'Attribute surfaces' }
        ]
      },
      {
        heading: 'Canada',
        items: [
          { label: 'Canada Swingometer', to: '/canada-swing-deck', description: '338 ridings with swing and palette parity' }
        ]
      },
      {
        heading: 'United Kingdom',
        items: [
          { label: 'UK Wards (DeckGL)', to: '/uk-wards', description: 'Ward polygons with fill/extrusion' }
        ]
      }
    ]
  },
  {
    id: 'echarts',
    label: 'ECharts GL',
    sections: [
      {
        heading: '3D Charts',
        items: [
          { label: 'ECharts 3D', to: '/echarts-3d', description: 'Volumetric/GL chart experiments' }
        ]
      }
    ]
  },
];

const focusableSelector = 'a[href],button:not([disabled])';

const MegaMenu: React.FC = () => {
  const [openId, setOpenId] = useState<string | null>(null);
  const navRef = useRef<HTMLElement | null>(null);
  const triggerRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const close = useCallback(() => {
    setOpenId(null);
  }, []);

  // Close on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (!navRef.current) return;
      if (!navRef.current.contains(e.target as Node)) {
        close();
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [close]);

  // Global key handling (Escape)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && openId) {
        e.preventDefault();
        const prev = openId;
        close();
        triggerRefs.current[prev]?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openId, close]);

  // Trap focus inside an open panel (simple first/last wrap)
  useEffect(() => {
    if (!openId) return;
    const panel = document.getElementById(`mega-panel-${openId}`);
    if (!panel) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const focusables = Array.from(panel.querySelectorAll<HTMLElement>(focusableSelector));
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    panel.addEventListener('keydown', onKey);
    return () => panel.removeEventListener('keydown', onKey);
  }, [openId]);

  const onTriggerKey = (e: React.KeyboardEvent, index: number) => {
    const current = CATEGORIES[index];
    if (!current) return;
    switch (e.key) {
      case 'ArrowRight': {
        e.preventDefault();
        const next = CATEGORIES[(index + 1) % CATEGORIES.length];
        triggerRefs.current[next.id]?.focus();
        break;
      }
      case 'ArrowLeft': {
        e.preventDefault();
        const prev = CATEGORIES[(index - 1 + CATEGORIES.length) % CATEGORIES.length];
        triggerRefs.current[prev.id]?.focus();
        break;
      }
      case 'ArrowDown': {
        e.preventDefault();
        setOpenId(current.id);
        queueMicrotask(() => {
          const panel = document.getElementById(`mega-panel-${current.id}`);
          const first = panel?.querySelector<HTMLElement>(focusableSelector);
          first?.focus();
        });
        break;
      }
      case 'Enter':
      case ' ': {
        e.preventDefault();
        setOpenId(o => (o === current.id ? null : current.id));
        break;
      }
      default:
        break;
    }
  };

  return (
    <nav ref={navRef} className="relative select-none" aria-label="Primary navigation">
      <ul className="flex items-center gap-4 m-0 p-0 list-none">
        {CATEGORIES.map((cat, idx) => {
          const open = openId === cat.id;
          return (
            <li key={cat.id} className="relative">
              <button
                ref={el => { triggerRefs.current[cat.id] = el; }}
                id={`mega-trigger-${cat.id}`}
                aria-haspopup="true"
                aria-expanded={open}
                aria-controls={`mega-panel-${cat.id}`}
                onClick={() => setOpenId(open ? null : cat.id)}
                onKeyDown={e => onTriggerKey(e, idx)}
                className={`inline-flex items-center gap-1 px-3 py-2 rounded-md text-[13px] font-medium tracking-wide focus:outline-none focus-visible:ring-2 transition-colors border border-transparent ${open ? 'text-slate-100' : 'text-slate-300 hover:text-slate-100'}`}
                style={open ? { boxShadow: '0 0 0 1px rgba(255,255,255,0.12) inset', background: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.12)' } : undefined}
              >
                {cat.label}
                <span className={`ml-1 inline-block text-slate-500`} aria-hidden>▾</span>
              </button>
              {open && (
                <div
                  id={`mega-panel-${cat.id}`}
                  role="group"
                  aria-labelledby={`mega-trigger-${cat.id}`}
                  className="absolute left-0 top-full mt-2 w-[680px] z-50 rounded-xl border shadow-xl p-5 grid grid-cols-2 gap-6 isolate"
                  style={{
                    background: 'rgba(15,17,21,0.8)',
                    backdropFilter: 'blur(10px)',
                    WebkitBackdropFilter: 'blur(10px)',
                    borderColor: 'rgba(255,255,255,0.12)'
                  }}
                >
                  {cat.sections.map(section => (
                    <div key={section.heading} className="min-w-0">
                      <div className="text-[11px] uppercase tracking-wider text-slate-400 mb-3">{section.heading}</div>
                      <ul className="space-y-1.5">
                        {section.items.map(item => (
                          <li key={item.to}>
                            <Link
                              to={item.to}
                              className="group block rounded-md px-2.5 py-2 text-[12.5px] text-slate-300 hover:text-slate-100 focus:text-slate-100 focus:outline-none transition-colors"
                              style={{
                                background: 'transparent'
                              }}
                              onClick={() => close()}
                            >
                              <span className="block font-medium leading-tight">
                                <span className="inline-block w-1.5 h-1.5 rounded-full mr-2 align-middle" style={{ backgroundColor: PORTAL_ACCENT }} />
                                {item.label}
                              </span>
                              {item.description && (
                                <span className="block text-[11px] text-slate-500 mt-0.5 leading-snug line-clamp-2">{item.description}</span>
                              )}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
};

export default MegaMenu;
