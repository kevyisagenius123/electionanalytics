import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Papa from 'papaparse';
import DeckGL from '@deck.gl/react';
import { GeoJsonLayer } from '@deck.gl/layers';
import type { FeatureCollection } from 'geojson';
import CanadaSwingometerPanel from '../components/CanadaSwingometerPanel';

type ViewState = { longitude: number; latitude: number; zoom: number; pitch?: number; bearing?: number };

type ProjectionRow = { fed_code: string; region: string; province_code: string; shares: Record<string, number>; winner: string; margin: number; colorHex?: string; extrudedHeight?: number; projectedTotalVotes?: number };

const colorRampByWinner = {
  LIB: ["#FFD6D6","#FFB5B5","#FF8E8E","#E04F46","#B71D00","#7A0E00"],
  CPC: ["#D6E4FF","#B3D1FF","#85BAFF","#4A91FF","#1862D6","#063A73"],
  NDP: ["#FFE4CC","#FFC999","#FFAD66","#F07F1A","#C75500","#7A3300"],
  BQ:  ["#D2F3FF","#A9E9FF","#7BDFFF","#34C4F2","#0093B3","#005068"],
  GPC: ["#DAF5D6","#B8EBB1","#8DDF82","#4CBF3D","#1E8D14","#0B4F05"],
  PPC: ["#F1DAFF","#E3B5FF","#D28CFF","#B553F2","#7F1DB3","#490073"],
  OTH: ["#ECECEC","#D9D9D9","#BFBFBF","#999999","#6B6B6B","#444444"],
} as const;

const hexToRgbaArray = (hex: string, a: number) => {
  const c = hex.replace('#', '');
  const n = parseInt(c.length === 3 ? c.split('').map((x: string) => x + x).join('') : c, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, a] as [number, number, number, number];
};

// Map various party codes to our canonical keys
const normalizeParty = (p: string): keyof typeof colorRampByWinner => {
  const u = (p || '').toUpperCase();
  if (u === 'LPC' || u === 'LIBERAL' || u === 'LIB') return 'LIB';
  if (u === 'CPC' || u === 'CON' || u === 'CONSERVATIVE' || u === 'PC') return 'CPC';
  if (u === 'NDP' || u === 'NDP-NPD' || u === 'NEW DEMOCRATIC') return 'NDP';
  if (u === 'BQ' || u === 'BLOC' || u === 'BLOC QUEBECOIS' || u === 'BLOC QUÉBÉCOIS') return 'BQ';
  if (u === 'GPC' || u === 'GRN' || u === 'GREEN' || u === 'GREEN PARTY') return 'GPC';
  if (u === 'PPC' || u === 'PEOPLE\'S' || u === 'PEOPLES' || u === 'PEOPLE\'S PARTY') return 'PPC';
  return 'OTH';
};

// Convert winner + margin (0-1) to a ramp color
const winnerMarginToRgba = (winner: string, margin01: number, alpha: number): [number,number,number,number] => {
  const w = normalizeParty(winner);
  const pct = Math.max(0, Math.min(100, (margin01 || 0) * 100));
  let idx = 0;
  if (pct < 1) idx = 0; else if (pct < 5) idx = 1; else if (pct < 10) idx = 2; else if (pct < 20) idx = 3; else if (pct < 30) idx = 4; else idx = 5;
  const ramp = colorRampByWinner[w] || colorRampByWinner.OTH;
  return hexToRgbaArray(ramp[Math.min(idx, ramp.length - 1)], alpha);
};

interface BaselineRow { fedCode: string; provinceCode: string; region: string; totalVotes: number; lib: number; cpc: number; ndp: number; bq: number; gpc: number; ppc: number; oth: number; }

const BACKEND_BASE = 'https://ca-deck-backend-977058061007.us-central1.run.app';

const CanadaSwingDeckPage: React.FC = () => {
  const [viewState, setViewState] = useState<ViewState>({ longitude: -96.5, latitude: 60.0, zoom: 2.6, pitch: 45, bearing: 0 });
  const [geo, setGeo] = useState<FeatureCollection | null>(null);
  const [baseline, setBaseline] = useState<Map<string, BaselineRow>>(new Map());
  const [projected, setProjected] = useState<Record<string, ProjectionRow> | null>(null);
  const [status, setStatus] = useState<string>('Loading…');
  const [fillAlpha, setFillAlpha] = useState<number>(235);
  const [heightScale, setHeightScale] = useState<number>(1.0);
  const [winners, setWinners] = useState<Record<string, { party: string }> | null>(null);

  // Normalize various fed code strings/numbers to a canonical 5-digit code (e.g., 35059)
  const normalizeFedCode = (val: any): string => {
    let s = val != null ? String(val).trim() : '';
    const m = s.match(/(\d{5})/);
    if (m) return m[1];
    // If it's numeric but not 5 digits, left-pad
    const digits = (s.match(/\d+/)?.[0] ?? '').slice(0, 5);
    if (digits) return digits.padStart(5, '0');
    return s;
  };

  // Helpers to extract fed_code from various GeoJSON property shapes
  const pick = (obj: any, keys: string[]): any => {
    for (const k of keys) {
      const v = obj?.[k];
      if (v != null) return Array.isArray(v) ? v[0] : v;
    }
    return undefined;
  };
  const extractCode = (props: any): string => {
    let fed: any = pick(props, ['fed_code','FEDUID','EDUID','ED_ID','EDUID_FED','ED_CODE','FEDUID_TXT']);
    if (fed == null && typeof props?.ED_CODE === 'number') fed = props.ED_CODE;
    if (Array.isArray(fed)) fed = fed.length ? fed[0] : '';
    let s = fed != null ? String(fed).trim() : '';
    const m = s.match(/(\d{5})/);
    if (m) s = m[1];
    return s;
  };

  // Helper to load winners CSV (fallback like Cesium)
  const loadWinnersCsv = async (cancelledRef: () => boolean) => {
    try {
      const tryUrls = [`${import.meta.env.BASE_URL}data/table_tableau11.csv`, `${import.meta.env.BASE_URL}table_tableau11.csv`];
      let csvText: string | null = null;
      for (const u of tryUrls) {
        try {
          const wr = await fetch(u);
          if (wr.ok) { csvText = await wr.text(); break; }
        } catch {}
      }
      if (!csvText || cancelledRef()) return false;
      const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true });
      const rows: any[] = Array.isArray(parsed.data) ? (parsed.data as any[]) : [];
      const fedKey = 'Electoral District Number/Numéro de circonscription';
      const partyKey = 'Party Code';
      const winnersMap: Record<string, { party: string }> = {};
      for (const rr of rows) {
        const fed = String(rr?.[fedKey] ?? '').trim();
        const party = String(rr?.[partyKey] ?? '').trim().toUpperCase();
        if (fed && party) winnersMap[fed] = { party };
      }
      if (!cancelledRef()) {
        setWinners(winnersMap);
        setStatus(prev => (prev ? prev + ' • ' : '') + 'winners CSV loaded');
      }
      return Object.keys(winnersMap).length > 0;
    } catch {
      return false;
    }
  };

  // Load GeoJSON and baseline once
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const gj = await fetch(`${import.meta.env.BASE_URL}data/canada_fed_districts.geojson`).then(r => r.json());
        if (cancelled) return;
        setGeo(gj);
      } catch {}
      try {
  // Kick off winners CSV load in parallel so we can fill any baseline gaps
  loadWinnersCsv(() => cancelled);
  const r = await fetch(`${BACKEND_BASE}/api/canada/timeline?years=2021`);
        if (r.ok) {
          const j = await r.json();
          const arr: any[] = Array.isArray(j?.['2021']) ? j['2021'] : [];
          const m = new Map<string, BaselineRow>();
          for (const b of arr) {
            const fedCode = normalizeFedCode(b?.fedCode ?? b?.fed_code ?? '');
            if (!fedCode) continue;
            m.set(fedCode, {
              fedCode,
              provinceCode: String(b?.provinceCode ?? ''),
              region: String(b?.region ?? ''),
              totalVotes: Number(b?.totalVotes ?? 0),
              lib: Number(b?.lib ?? 0), cpc: Number(b?.cpc ?? 0), ndp: Number(b?.ndp ?? 0), bq: Number(b?.bq ?? 0), gpc: Number(b?.gpc ?? 0), ppc: Number(b?.ppc ?? 0), oth: Number(b?.oth ?? 0)
            });
          }
          if (!cancelled) {
            setBaseline(m);
            setStatus(`Ready • ridings: ${m.size}`);
            // Fallback: if baseline is empty, try winners CSV like Cesium uses
            if (m.size === 0) {
              await loadWinnersCsv(() => cancelled);
            }
          }
        } else {
          // Backend responded not-ok; attempt to load winners CSV anyway
          if (!cancelled) setStatus(`Canada deck backend error (${r.status}) • trying winners CSV…`);
          await loadWinnersCsv(() => cancelled);
        }
      } catch (e) {
        // Backend unreachable; attempt to load winners CSV so map isn't grey
        if (!cancelled) setStatus('Canada deck backend unavailable (/api/canada) • trying winners CSV…');
        await loadWinnersCsv(() => cancelled);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Compute baseline winner, margin, and matching ramp color
  const baselineColor = (row?: BaselineRow | null, alpha=235): [number,number,number,number] => {
    if (!row) return [102,112,133,alpha];
    const totals: Record<string, number> = { LIB: row.lib, CPC: row.cpc, NDP: row.ndp, BQ: row.bq, GPC: row.gpc, PPC: row.ppc, OTH: row.oth };
    // Outside QC, zero out BQ
    if (row.region !== 'QC') totals.BQ = 0;
    const totalVotes = Object.values(totals).reduce((a,b)=>a+b, 0) || 1;
    const shares = Object.fromEntries(Object.entries(totals).map(([k,v])=> [k, v/totalVotes])) as Record<string, number>;
    const sorted = Object.entries(shares).sort((a,b)=> b[1]-a[1]);
    const winner = (sorted[0]?.[0] || 'OTH') as keyof typeof colorRampByWinner;
    const winShare = sorted[0]?.[1] ?? 0;
    const runner = sorted[1]?.[1] ?? 0;
    const margin = Math.max(0, winShare - runner) * 100; // percent
    let idx = 0; if (margin < 1) idx = 0; else if (margin < 5) idx = 1; else if (margin < 10) idx = 2; else if (margin < 20) idx = 3; else if (margin < 30) idx = 4; else idx = 5;
    const ramp = colorRampByWinner[winner] || colorRampByWinner.OTH;
    return hexToRgbaArray(ramp[Math.min(idx, ramp.length-1)], alpha);
  };

  // Compute baseline winner label and whether it's "weak" (zeros/OTH); used for tooltip and fallback decision
  const getBaselineWinner = (row?: BaselineRow | null): { winner: keyof typeof colorRampByWinner; isWeak: boolean } => {
    if (!row) return { winner: 'OTH', isWeak: true };
    const totals: Record<string, number> = { LIB: row.lib, CPC: row.cpc, NDP: row.ndp, BQ: row.bq, GPC: row.gpc, PPC: row.ppc, OTH: row.oth };
    if (row.region !== 'QC') totals.BQ = 0;
    const sum = Object.values(totals).reduce((a,b)=>a+b, 0);
    if (sum <= 0) return { winner: 'OTH', isWeak: true };
    const sorted = Object.entries(totals).sort((a,b)=> b[1]-a[1]);
    const w = (sorted[0]?.[0] || 'OTH') as keyof typeof colorRampByWinner;
    return { winner: w, isWeak: w === 'OTH' };
  };

  const layer = useMemo(() => {
    if (!geo) return null;
    const pick = (obj: any, keys: string[]): any => {
      for (const k of keys) {
        const v = obj?.[k];
        if (v != null) return Array.isArray(v) ? v[0] : v;
      }
      return undefined;
    };
    const extractCode = (props: any): string => {
      let fed: any = pick(props, ['fed_code','FEDUID','EDUID','ED_ID','EDUID_FED','ED_CODE','FEDUID_TXT']);
      if (fed == null && typeof props?.ED_CODE === 'number') fed = props.ED_CODE;
      if (Array.isArray(fed)) fed = fed.length ? fed[0] : '';
      let s = fed != null ? String(fed).trim() : '';
      // Handle cases like '["35059"]' → '35059'
      const m = s.match(/(\d{5})/);
      if (m) s = m[1];
      return s;
    };
    // Easing for smoother transitions
    const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

    return new GeoJsonLayer({
      id: 'ca-ridings',
      data: geo as any,
      pickable: true,
      stroked: true,
      filled: true,
      extruded: true,
      wireframe: false,
      getLineColor: [255, 255, 255, 150],
      getLineWidth: 1,
      getFillColor: (f: any) => {
        try {
          const code = extractCode(f?.properties);
          if (projected && projected[code]) {
            const pr = projected[code];
            // Prefer provided hex if backend computed it; otherwise derive from winner + margin using the same Canada palette
            const hex = pr.colorHex;
            if (hex) return hexToRgbaArray(hex, fillAlpha);
            return winnerMarginToRgba(pr.winner, pr.margin, fillAlpha);
          }
          const base = baseline.get(code);
          if (base) {
            const { winner, isWeak } = getBaselineWinner(base);
            // If baseline looks wrong (OTH/zero), prefer winners CSV fallback if available
            if (isWeak && winners?.[code]?.party) {
              const w = normalizeParty(winners[code].party);
              const ramp = colorRampByWinner[w] || colorRampByWinner.OTH;
              return hexToRgbaArray(ramp[3], fillAlpha);
            }
            return baselineColor(base, fillAlpha);
          }
          // Fallback: color by winners CSV if available
          const w = winners?.[code]?.party;
          if (w) {
            const ramp = colorRampByWinner[normalizeParty(w)] || colorRampByWinner.OTH;
            // mid-strength bucket
            return hexToRgbaArray(ramp[3], fillAlpha);
          }
          return [102,112,133,fillAlpha];
        } catch { return [102, 112, 133, fillAlpha]; }
      },
      getElevation: (f: any) => {
        try {
          const code = extractCode(f?.properties);
          if (projected && projected[code]) {
            const h = projected[code].extrudedHeight ?? 4000;
            return h * heightScale;
          }
          // baseline elevation heuristic by turnout
          const base = baseline.get(code);
          const t = Math.max(0, Math.min(1, (base?.totalVotes ?? 0) / 150000));
          return (2000 + 6000 * t) * heightScale;
        } catch { return 2000 * heightScale; }
      },
      updateTriggers: {
        getFillColor: [projected, baseline, winners, fillAlpha],
        getElevation: [projected, baseline, heightScale],
      },
      transitions: {
        // Longer durations and easing for smoother transitions
        getFillColor: { duration: 900, easing: easeInOutCubic },
        getElevation: { duration: 900, easing: easeInOutCubic },
      },
    });
  }, [geo, projected, baseline, fillAlpha, heightScale]);

  return (
    <div className="w-full h-screen bg-slate-950 text-slate-100">
      <div className="absolute top-3 left-3 z-10 flex gap-3 items-start">
        <Link to="/" className="px-3 py-1.5 rounded-md text-xs font-medium bg-slate-900/80 border border-slate-700 hover:border-slate-600">← Home</Link>
        <CanadaSwingometerPanel autoRun={false} onProjection={(rows) => {
          const map: Record<string, ProjectionRow> = {};
          (rows || []).forEach((r: any) => { if (r?.fed_code) map[normalizeFedCode(r.fed_code)] = r as ProjectionRow; });
          setProjected(map);
        }} />
      </div>
      <div className="absolute top-3 right-3 z-10 bg-black/50 border border-slate-700 rounded p-2 text-xs">
        <div className="flex items-center gap-2">
          <label>Opacity</label>
          <input type="range" min={80} max={255} step={1} value={fillAlpha} onChange={e=> setFillAlpha(parseInt(e.target.value))} />
          <div className="w-10 text-right tabular-nums">{fillAlpha}</div>
        </div>
        <div className="flex items-center gap-2 mt-1">
          <label>Height</label>
          <input type="range" min={0} max={5} step={0.1} value={heightScale} onChange={e=> setHeightScale(parseFloat(e.target.value))} />
          <div className="w-10 text-right tabular-nums">{heightScale.toFixed(1)}</div>
        </div>
        <div className="mt-1 text-[10px] opacity-70">{status}</div>
      </div>
      <DeckGL
        controller={true}
        initialViewState={viewState}
        onViewStateChange={(e:any)=> setViewState(v=> ({ ...v, ...e.viewState }))}
        layers={layer? [layer] : []}
        getTooltip={(info:any)=>{
          const f = info?.object; if (!f) return null;
          const code = extractCode(f?.properties);
          const proj = projected?.[code];
          const base = baseline.get(code);
          const baselineWinnerLabel = (()=>{
            if (!base) return winners?.[code]?.party ? normalizeParty(winners[code].party) : '—';
            const { winner, isWeak } = getBaselineWinner(base);
            if (isWeak && winners?.[code]?.party) return normalizeParty(winners[code].party);
            return winner;
          })();
          return {
            text: `${f?.properties?.fed_name_en || f?.properties?.ENNAME || ''}\n` +
                  `Code: ${code}\n` +
                  (proj? `Projected: ${proj.winner} ${(proj.margin*100).toFixed(1)}%\n` : `Baseline: ${baselineWinnerLabel}`)
          };
        }}
        style={{ position: 'absolute', inset: '0' }}
      />
    </div>
  );
};

export default CanadaSwingDeckPage;
