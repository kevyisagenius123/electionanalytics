import React, { useEffect, useMemo, useState } from 'react';

type Mode = 'UNS' | 'PRS' | 'ELASTICITY';
const PARTIES = ['LIB','CPC','NDP','BQ','GPC','PPC','OTH'] as const;
type Party = typeof PARTIES[number];
const REGIONS = ['ATL','QC','ON','MB_SK','AB','BC','TERR'] as const;
type Region = typeof REGIONS[number];

interface SwingResponse {
  summary?: { seats?: Record<string, number>; nationalShares?: Record<string, number> };
  byRegion?: Record<string, { seats?: Record<string, number>; shares?: Record<string, number> }>;
  perRiding?: Array<{ fed_code: string; region: string; province_code: string; shares: Record<string, number>; winner: string; margin: number }>;
}

const fmtPct = (x?: number) => (typeof x === 'number' ? (x * 100).toFixed(1) + '%' : '—');

const BACKEND_BASE = 'https://ca-deck-backend-977058061007.us-central1.run.app';

export default function CanadaSwingometerPanel({ onProjection, autoRun = false }: { onProjection?: (perRiding: SwingResponse['perRiding']) => void; autoRun?: boolean }) {
  const [mode, setMode] = useState<Mode>('UNS');
  const [national, setNational] = useState<Record<Party, number>>({ LIB: 0, CPC: 0, NDP: 0, BQ: 0, GPC: 0, PPC: 0, OTH: 0 });
  const emptyRegion = () => ({ LIB: 0, CPC: 0, NDP: 0, BQ: 0, GPC: 0, PPC: 0, OTH: 0 } as Record<Party, number>);
  const [regional, setRegional] = useState<Record<Region, Record<Party, number>>>(
    () => ({ ATL: emptyRegion(), QC: emptyRegion(), ON: emptyRegion(), MB_SK: emptyRegion(), AB: emptyRegion(), BC: emptyRegion(), TERR: emptyRegion() })
  );
  const [activeRegion, setActiveRegion] = useState<Region>('ATL');
  const [loading, setLoading] = useState(false);
  const [resp, setResp] = useState<SwingResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [turnoutShiftPct, setTurnoutShiftPct] = useState<number>(0); // +0.05 => +5% turnout overall
  const [extrusionMode, setExtrusionMode] = useState<'margin'|'turnout'|'hybrid'>('margin');
  const [autoApply, setAutoApply] = useState<boolean>(true);

  useEffect(() => { if (autoRun) applySwing(); }, [autoRun]);

  // Auto-apply: recompute projection as controls change
  useEffect(() => {
    if (!autoApply) return;
    const t = setTimeout(() => { applySwing(); }, 250);
    return () => clearTimeout(t);
  }, [autoApply, mode, turnoutShiftPct, extrusionMode, JSON.stringify(national), JSON.stringify(regional)]);

  const applySwing = async () => {
    setLoading(true); setError(null);
    try {
      // Only include regions with any non-zero delta to keep payload compact
      const regionalPayload: Record<string, Record<string, number>> = {};
      (REGIONS as ReadonlyArray<Region>).forEach(r => {
        const vals = regional[r];
        const hasAny = PARTIES.some(p => Math.abs(vals[p]) > 1e-9);
        if (hasAny) {
          const out: Record<string, number> = {};
          PARTIES.forEach(p => { out[p] = vals[p]; });
          regionalPayload[r] = out;
        }
      });
      const r = await fetch(`${BACKEND_BASE}/api/ca2021/swing`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, national, regional: regionalPayload, options: { capPerRiding: 0.2, turnoutShiftPct, extrusionMode } })
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j: SwingResponse = await r.json();
      setResp(j);
      onProjection?.(j.perRiding);
    } catch (e: any) {
      setError(e?.message || 'Request failed');
    } finally { setLoading(false); }
  };

  const seatsSorted = useMemo(() => {
    const s = resp?.summary?.seats || {};
    return Object.entries(s).sort((a, b) => (b[1] || 0) - (a[1] || 0));
  }, [resp]);

  return (
    <div className="bg-black/55 border border-slate-700/50 rounded p-2 text-[10px] text-slate-200 min-w-[260px]">
      <div className="flex items-center justify-between mb-1">
        <div className="font-semibold text-[11px]">Canada Swingometer</div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={autoApply} onChange={e=> setAutoApply(e.target.checked)} />
            Auto apply
          </label>
          {loading && <div className="text-[10px] opacity-80">computing…</div>}
        </div>
      </div>
      {error && <div className="text-[10px] text-red-300 mb-1">{error}</div>}
      <div className="flex items-center gap-1 mb-2 text-[10px]">
        {(['UNS','PRS'] as Mode[]).map(m => (
          <button key={m} onClick={() => setMode(m)} className={"px-2 py-0.5 rounded " + (mode===m? 'bg-indigo-600':'bg-slate-700 hover:bg-slate-600')}>{m}</button>
        ))}
      </div>
      <div className="mb-2 grid grid-cols-2 gap-2">
        <div>
          <div className="mb-0.5 font-semibold">Turnout Δ</div>
          <input type="range" min={-0.15} max={0.15} step={0.005} value={turnoutShiftPct} onChange={e=> setTurnoutShiftPct(parseFloat(e.target.value))} className="w-full" />
          <div className="text-right tabular-nums">{(turnoutShiftPct*100).toFixed(1)}%</div>
        </div>
        <div>
          <div className="mb-0.5 font-semibold">Extrusion</div>
          <select value={extrusionMode} onChange={e=> setExtrusionMode(e.target.value as any)} className="w-full bg-slate-700/60 rounded p-0.5 text-[10px]">
            <option value="margin">Margin</option>
            <option value="turnout">Turnout</option>
            <option value="hybrid">Hybrid</option>
          </select>
        </div>
      </div>
      <div className="space-y-1">
        {PARTIES.map(p => (
          <div key={p} className="flex items-center gap-2">
            <div className="w-8">{p}</div>
            <input type="range" min={-0.2} max={0.2} step={0.005} value={national[p]}
                   onChange={e => setNational(v => ({ ...v, [p]: parseFloat(e.target.value) }))}
                   className="flex-1" />
            <div className="w-14 text-right tabular-nums">{(national[p] * (mode==='PRS'?100:100)).toFixed(1)}{mode==='PRS'? '%': 'pt'}</div>
          </div>
        ))}
      </div>
      {/* Regional overrides */}
      <div className="mt-2">
        <div className="font-semibold text-[11px]">Regional overrides</div>
        <div className="flex flex-wrap gap-1 mt-1">
          {REGIONS.map(r => (
            <button key={r} onClick={()=> setActiveRegion(r)} className={"px-2 py-0.5 rounded "+(activeRegion===r? 'bg-indigo-600':'bg-slate-700 hover:bg-slate-600')}>{r}</button>
          ))}
        </div>
        <div className="mt-1 space-y-1">
          {PARTIES.map(p => (
            <div key={p} className="flex items-center gap-2">
              <div className="w-8">{p}</div>
              <input type="range" min={-0.2} max={0.2} step={0.005} value={regional[activeRegion][p]}
                     onChange={e => setRegional(v => ({ ...v, [activeRegion]: { ...v[activeRegion], [p]: parseFloat(e.target.value) } }))}
                     className="flex-1" />
              <div className="w-14 text-right tabular-nums">{(regional[activeRegion][p] * (mode==='PRS'?100:100)).toFixed(1)}{mode==='PRS'? '%': 'pt'}</div>
            </div>
          ))}
        </div>
        {/* Non-zero summary */}
        <div className="mt-1 text-[10px] text-slate-300">
          <span className="opacity-80">Active:</span> <span className="px-1 rounded bg-slate-700/60">{activeRegion}</span>
          <div className="mt-1 flex flex-wrap gap-1">
            {REGIONS.map(r => {
              const nz = PARTIES.reduce((acc, p)=> acc + (Math.abs(regional[r][p])>1e-9?1:0), 0);
              if (!nz) return null;
              return <span key={r} className="px-1 rounded bg-slate-700/60">{r}: {nz}</span>;
            })}
          </div>
        </div>
      </div>
      <div className="flex gap-1 mt-2">
        <button onClick={applySwing} className="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-700 rounded">Apply</button>
        <button onClick={()=>{ setNational({ LIB:0,CPC:0,NDP:0,BQ:0,GPC:0,PPC:0,OTH:0 }); setRegional({ ATL: emptyRegion(), QC: emptyRegion(), ON: emptyRegion(), MB_SK: emptyRegion(), AB: emptyRegion(), BC: emptyRegion(), TERR: emptyRegion() }); setTimeout(applySwing, 0); }} className="px-2 py-0.5 bg-slate-600 hover:bg-slate-700 rounded">Reset</button>
      </div>
      {/* Seat board */}
      {seatsSorted.length>0 && (
        <div className="mt-2">
          <div className="font-semibold text-[11px]">Projected seats</div>
          <ul className="mt-1 space-y-0.5 max-h-40 overflow-auto pr-1 custom-scroll">
            {seatsSorted.map(([party, seats]) => (
              <li key={party} className="flex items-center justify-between gap-2">
                <span>{party}</span>
                <span className="tabular-nums">{seats}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {/* National shares */}
      {resp?.summary?.nationalShares && (
        <div className="mt-2">
          <div className="font-semibold text-[11px]">Projected vote shares</div>
          <ul className="mt-1 space-y-0.5">
            {Object.entries(resp.summary.nationalShares).map(([party, s]) => (
              <li key={party} className="flex items-center justify-between gap-2"><span>{party}</span><span className="tabular-nums">{fmtPct(s)}</span></li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
