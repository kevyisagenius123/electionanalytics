import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Papa from 'papaparse';
import DeckGL from '@deck.gl/react';
import { GeoJsonLayer } from '@deck.gl/layers';
import type { FeatureCollection } from 'geojson';

type ViewState = { longitude: number; latitude: number; zoom: number; pitch?: number; bearing?: number };

interface RidingData {
  circonscription: string;
  electeurs: number;
  votesExprimes: number;
  abstentions: number;
  bulletinsRejetes: number;
  votesValides: number;
  oui: number;
  non: number;
  ouiPct: number;
  nonPct: number;
  // Language data
  anglophones1991: number;
  francophones1991: number;
  allophones1991: number;
  anglophones1996: number;
  francophones1996: number;
  allophones1996: number;
  // Simulation state
  countedPct: number;
  locked: boolean;
}

// Production-ready color system for 1995 Quebec Referendum
// Oui (gold/amber) gradient by margin strength
const OUI_COLORS = {
  200: [253, 230, 138, 235] as [number, number, number, number], // 0-1pp toss-up
  300: [252, 211, 77, 235] as [number, number, number, number],  // 1-3pp
  400: [251, 191, 36, 235] as [number, number, number, number],  // 3-5pp
  500: [245, 158, 11, 235] as [number, number, number, number],  // 5-10pp
  600: [217, 119, 6, 235] as [number, number, number, number],   // 10-20pp
  700: [180, 83, 9, 235] as [number, number, number, number],    // 20+pp
};

// Non (blue) gradient by margin strength
const NON_COLORS = {
  200: [191, 219, 254, 235] as [number, number, number, number], // 0-1pp toss-up
  300: [147, 197, 253, 235] as [number, number, number, number], // 1-3pp
  400: [96, 165, 250, 235] as [number, number, number, number],  // 3-5pp
  500: [59, 130, 246, 235] as [number, number, number, number],  // 5-10pp
  600: [37, 99, 235, 235] as [number, number, number, number],   // 10-20pp
  700: [29, 78, 216, 235] as [number, number, number, number],   // 20+pp
};

const NO_DATA_COLOR: [number, number, number, number] = [229, 231, 235, 235]; // Gray for unreported
const PARTIAL_OVERLAY: [number, number, number, number] = [100, 100, 100, 100]; // Gray overlay for partial results

const Quebec1995Page: React.FC = () => {
  const [viewState, setViewState] = useState<ViewState>({ 
    longitude: -71.2, 
    latitude: 46.8, 
    zoom: 5.5, 
    pitch: 45, 
    bearing: 0 
  });
  const [geo, setGeo] = useState<FeatureCollection | null>(null);
  const [ridingData, setRidingData] = useState<Record<string, RidingData>>({});
  const [dataVersion, setDataVersion] = useState(0); // Force layer updates
  const [status, setStatus] = useState<string>('Loading...');
  const [simRunning, setSimRunning] = useState(false);
  const [fillAlpha, setFillAlpha] = useState<number>(235);
  const [heightScale, setHeightScale] = useState<number>(1.0);
  const [simulationId, setSimulationId] = useState<string | null>(null);
  const pollIntervalRef = useRef<number | null>(null);
  
  // Backend API URL
  const API_BASE = 'https://qc-1995-backend-977058061007.us-central1.run.app/api/qc1995';

  // Province-wide tallies
  const provinceTotals = useMemo(() => {
    let totalOui = 0;
    let totalNon = 0;
    let totalValides = 0;
    let ridingsReporting = 0;
    let totalElecteurs = 0;
    let totalVotesExprimes = 0;

    Object.values(ridingData).forEach(r => {
      if (r.countedPct > 0) {
        const partial = r.countedPct / 100;
        totalOui += r.oui * partial;
        totalNon += r.non * partial;
        totalValides += r.votesValides * partial;
        ridingsReporting++;
      }
      totalElecteurs += r.electeurs;
      totalVotesExprimes += r.votesExprimes * (r.countedPct / 100);
    });

    const ouiPct = totalValides > 0 ? (totalOui / totalValides) * 100 : 0;
    const nonPct = totalValides > 0 ? (totalNon / totalValides) * 100 : 0;
    const margin = ouiPct - nonPct;
    const turnout = totalElecteurs > 0 ? (totalVotesExprimes / totalElecteurs) * 100 : 0;

    return {
      ouiPct,
      nonPct,
      margin,
      ridingsReporting,
      totalRidings: Object.keys(ridingData).length,
      turnout
    };
  }, [ridingData]);

  // Load GeoJSON
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Using 1992 Quebec provincial electoral boundaries (used in 1995 referendum)
        const gj = await fetch(`${import.meta.env.BASE_URL}data/quebec_1995_ridings.geojson`).then(r => r.json());
        if (cancelled) return;
        
        // No filtering needed - this is already Quebec 1995 boundaries (125 ridings)
        const quebecGeo: FeatureCollection = gj;
        
        setGeo(quebecGeo);
        setStatus(`GeoJSON loaded (${quebecGeo.features.length} Quebec ridings)`);
        
        // Debug: Log first few GeoJSON feature names
        console.log('First 5 GeoJSON features:', quebecGeo.features.slice(0, 5).map(f => ({
          NomCEP1992: f.properties?.NomCEP1992,
          allProps: Object.keys(f.properties || {})
        })));
      } catch (err) {
        console.error('Failed to load GeoJSON:', err);
        setStatus('GeoJSON load failed');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Load baseline data from backend API
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(`${API_BASE}/baseline`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const baseline = await response.json();
        if (cancelled) return;
        
        // Note: Backend returns province aggregate, we'll get individual ridings from simulation
        setStatus(`Loaded baseline: ${baseline.totalRidings} ridings`);
      } catch (err) {
        console.error('Failed to load baseline:', err);
        setStatus('Backend connection failed');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Simulation engine - Use backend API
  const startSimulation = async () => {
    try {
      console.log('Starting simulation...');
      setSimRunning(true);
      setStatus('Creating simulation...');
      
      // Create simulation with backend
      const config = {
        intervalMs: 350,
        lockThreshold: 98.0,
        enableGaussianNoise: true,
        enableEarlyPollBias: true,
        enableReportingWaves: true,
        regionDelays: {
          "Montreal": 30,
          "Quebec City": 35,
          "Outaouais": 45,
          "Laval": 40,
          "Monteregie": 50,
          "Estrie": 55,
          "Mauricie": 60,
          "North": 75,
          "Rural": 75,
          "Gaspe": 105
        }
      };
      
      console.log('Sending request to:', `${API_BASE}/simulate`);
      console.log('Config:', config);
      
      const response = await fetch(`${API_BASE}/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      
      console.log('Response status:', response.status);
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Error response:', errorText);
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }
      const simulation = await response.json();
      console.log('Simulation created:', simulation.simulationId);
      setSimulationId(simulation.simulationId);
      setStatus('Polls closed • Results incoming...');
      
      // Poll for updates every 350ms
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = window.setInterval(async () => {
        try {
          const stateResponse = await fetch(`${API_BASE}/simulation/${simulation.simulationId}`);
          if (!stateResponse.ok) {
            console.error('Poll failed with status:', stateResponse.status);
            throw new Error(`HTTP ${stateResponse.status}`);
          }
          const state = await stateResponse.json();
          console.log('Poll update:', state.status, `${state.ridingsReporting}/${state.ridings.length} reporting`);
          
          // Update riding data from backend - use plain object, not Map
          const dataObj: Record<string, RidingData> = {};
          state.ridings.forEach((r: any, index: number) => {
            const riding: RidingData = {
              circonscription: r.name,
              electeurs: r.electeurs,
              votesExprimes: r.votesExprimes,
              abstentions: r.abstentions,
              bulletinsRejetes: r.bulletinsRejetes,
              votesValides: r.votesValides,
              oui: r.oui,
              non: r.non,
              ouiPct: r.currentOuiPct, // Use current noisy percentages
              nonPct: r.currentNonPct,
              anglophones1991: r.anglophones1991 || 0,
              francophones1991: r.francophones1991 || 0,
              allophones1991: r.allophones1991 || 0,
              anglophones1996: r.anglophones1996 || 0,
              francophones1996: r.francophones1996 || 0,
              allophones1996: r.allophones1996 || 0,
              countedPct: r.countedPct,
              locked: r.locked
            };
            dataObj[r.name] = riding;
            
            // Debug: Log first few riding names
            if (index < 3) {
              console.log('Riding from backend:', r.name, 'countedPct:', r.countedPct, 'ouiPct:', r.currentOuiPct);
            }
          });
          setRidingData(dataObj);
          setDataVersion(v => v + 1); // Increment to force layer re-render
          console.log('Total ridings in object:', Object.keys(dataObj).length);
          console.log('Sample object keys:', Object.keys(dataObj).slice(0, 5));
          
          // Update status with current aggregate
          const agg = state.currentAggregate;
          const ouiPct = agg.ouiPct.toFixed(2);
          const nonPct = agg.nonPct.toFixed(2);
          setStatus(`Oui: ${ouiPct}% • Non: ${nonPct}% • ${state.ridingsReporting}/${state.ridings.length} reporting`);
          
          // Check if simulation is complete
          if (state.status === 'COMPLETED') {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
            setSimRunning(false);
            setStatus('All ridings reported • Final: ' + 
              `Oui ${state.finalAggregate.ouiPct.toFixed(2)}% • Non ${state.finalAggregate.nonPct.toFixed(2)}%`);
          }
        } catch (err) {
          console.error('Failed to poll simulation:', err);
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
          setSimRunning(false);
          setStatus('Simulation error');
        }
      }, 350);
      
    } catch (err) {
      console.error('Failed to start simulation:', err);
      setSimRunning(false);
      setStatus(`Failed to start simulation: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  // DeckGL layer
  const layers = useMemo(() => {
    if (!geo) return [];

    return [
      new GeoJsonLayer({
        id: 'quebec-ridings',
        data: geo,
        filled: true,
        extruded: true,
        wireframe: true,
        updateTriggers: {
          getFillColor: [ridingData, dataVersion],
          getElevation: [ridingData, dataVersion],
          getLineColor: [ridingData, dataVersion]
        },
        getElevation: (f: any) => {
          const name = f.properties?.NomCEP1992 || '';
          const riding = ridingData[name];
          if (!riding || riding.countedPct === 0) return 100;
          
          const margin = Math.abs(riding.ouiPct - riding.nonPct);
          return margin * 500 * heightScale * (riding.countedPct / 100);
        },
        getFillColor: (f: any): [number, number, number, number] => {
          const name = f.properties?.NomCEP1992 || '';
          const riding = ridingData[name];
          
          // Debug: Log EVERY lookup to see what's happening
          if (!riding && name) {
            console.log('LOOKUP FAILED - GeoJSON name:', name, 'Object has:', Object.keys(ridingData).length, 'keys');
          } else if (riding && riding.countedPct > 0) {
            console.log('LOOKUP SUCCESS - name:', name, 'countedPct:', riding.countedPct, 'ouiPct:', riding.ouiPct);
          }
          
          if (!riding || riding.countedPct === 0) return NO_DATA_COLOR;
          
          const leader = riding.ouiPct > riding.nonPct ? 'OUI' : 'NON';
          const margin = Math.abs(riding.ouiPct - riding.nonPct);
          
          // Select color bucket based on margin (percentage points)
          let colorBucket: [number, number, number, number];
          const colors = leader === 'OUI' ? OUI_COLORS : NON_COLORS;
          
          if (margin >= 20) {
            colorBucket = colors[700]; // 20+ pp
          } else if (margin >= 10) {
            colorBucket = colors[600]; // 10-20 pp
          } else if (margin >= 5) {
            colorBucket = colors[500]; // 5-10 pp
          } else if (margin >= 3) {
            colorBucket = colors[400]; // 3-5 pp
          } else if (margin >= 1) {
            colorBucket = colors[300]; // 1-3 pp
          } else {
            colorBucket = colors[200]; // 0-1 pp (toss-up)
          }
          
          // Dim if partial results (not locked)
          if (riding.countedPct < 100 && !riding.locked) {
            return [
              colorBucket[0] * 0.7,
              colorBucket[1] * 0.7,
              colorBucket[2] * 0.7,
              colorBucket[3]
            ];
          }
          
          return colorBucket;
        },
        getLineColor: (f: any): [number, number, number, number] => {
          const name = f.properties?.NomCEP1992 || '';
          const riding = ridingData[name];
          // Locked ridings get a brighter border (violet glow effect)
          if (riding && riding.locked) {
            return [168, 85, 247, 180]; // Violet accent for locked
          }
          return [15, 23, 42, 200]; // Dark slate for normal borders
        },
        getLineWidth: 50,
        lineWidthMinPixels: 0.6,
        lineWidthMaxPixels: 1.2,
        pickable: true,
        autoHighlight: true,
        highlightColor: [255, 255, 255, 120],
      })
    ];
  }, [geo, ridingData, fillAlpha, heightScale, dataVersion]); // Added dataVersion to force updates

  return (
    <div className="w-full h-screen bg-slate-950 text-slate-100">
      {/* Home button */}
      <div className="absolute top-3 left-3 z-10">
        <Link to="/" className="px-3 py-1.5 rounded-md text-xs font-medium bg-slate-900/80 border border-slate-700 hover:border-slate-600">← Home</Link>
      </div>

      {/* Province banner */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 bg-slate-900/92 border border-slate-700 rounded-lg px-6 py-3 backdrop-blur-sm shadow-xl">
        <div className="flex items-center gap-8">
          <div className="text-center">
            <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">Oui</div>
            <div className="text-2xl font-bold tabular-nums" style={{ color: '#F59E0B' }}>
              {provinceTotals.ouiPct.toFixed(1)}%
            </div>
          </div>
          <div className="text-center">
            <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">Margin</div>
            <div 
              className="text-xl font-bold tabular-nums px-3 py-1 rounded"
              style={{ 
                backgroundColor: provinceTotals.margin > 0 ? '#F59E0B' : '#3B82F6',
                color: '#FFFFFF'
              }}
            >
              {provinceTotals.margin > 0 ? '+' : ''}{provinceTotals.margin.toFixed(2)}
            </div>
          </div>
          <div className="text-center">
            <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">Non</div>
            <div className="text-2xl font-bold tabular-nums" style={{ color: '#3B82F6' }}>
              {provinceTotals.nonPct.toFixed(1)}%
            </div>
          </div>
        </div>
        <div className="mt-2 pt-2 border-t border-slate-700 flex items-center justify-between gap-6 text-[11px] text-slate-300">
          <div>Ridings: <span className="font-semibold text-white">{provinceTotals.ridingsReporting}/{provinceTotals.totalRidings}</span></div>
          <div>Turnout: <span className="font-semibold text-white">{provinceTotals.turnout.toFixed(1)}%</span></div>
        </div>
      </div>

      {/* Controls */}
      <div className="absolute top-3 right-3 z-10 bg-black/70 border border-slate-700 rounded p-3 text-xs space-y-2 backdrop-blur-sm">
        <button
          onClick={startSimulation}
          disabled={simRunning}
          className="w-full px-3 py-2 rounded bg-emerald-700 hover:bg-emerald-600 disabled:bg-slate-700 disabled:cursor-not-allowed font-medium"
        >
          {simRunning ? 'Simulation Running...' : 'Start Simulation'}
        </button>
        <div className="pt-2 border-t border-slate-700">
          <div className="flex items-center gap-2">
            <label>Opacity</label>
            <input type="range" min={80} max={255} step={1} value={fillAlpha} onChange={e=> setFillAlpha(parseInt(e.target.value))} className="flex-1" />
            <div className="w-10 text-right tabular-nums">{fillAlpha}</div>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <label>Height</label>
            <input type="range" min={0.1} max={3} step={0.1} value={heightScale} onChange={e=> setHeightScale(parseFloat(e.target.value))} className="flex-1" />
            <div className="w-10 text-right tabular-nums">{heightScale.toFixed(1)}×</div>
          </div>
        </div>
        <div className="pt-2 border-t border-slate-700 text-[10px] text-slate-400">
          {status}
        </div>
      </div>

      {/* Legend */}
      <div className="absolute bottom-3 left-3 z-10 bg-slate-900/92 border border-slate-700 rounded-lg p-3 text-xs backdrop-blur-sm shadow-xl" style={{ maxWidth: '280px' }}>
        <div className="font-semibold mb-3 text-white">Leader & Margin (pp)</div>
        
        {/* Non (Blue) buckets - right to left */}
        <div className="mb-3">
          <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-1.5">Non (Blue)</div>
          <div className="flex gap-1">
            <div className="flex-1 text-center">
              <div className="h-5 rounded" style={{ backgroundColor: '#1D4ED8' }} />
              <div className="text-[9px] text-slate-400 mt-0.5">20+</div>
            </div>
            <div className="flex-1 text-center">
              <div className="h-5 rounded" style={{ backgroundColor: '#2563EB' }} />
              <div className="text-[9px] text-slate-400 mt-0.5">10-20</div>
            </div>
            <div className="flex-1 text-center">
              <div className="h-5 rounded" style={{ backgroundColor: '#3B82F6' }} />
              <div className="text-[9px] text-slate-400 mt-0.5">5-10</div>
            </div>
            <div className="flex-1 text-center">
              <div className="h-5 rounded" style={{ backgroundColor: '#60A5FA' }} />
              <div className="text-[9px] text-slate-400 mt-0.5">3-5</div>
            </div>
            <div className="flex-1 text-center">
              <div className="h-5 rounded" style={{ backgroundColor: '#93C5FD' }} />
              <div className="text-[9px] text-slate-400 mt-0.5">1-3</div>
            </div>
            <div className="flex-1 text-center">
              <div className="h-5 rounded" style={{ backgroundColor: '#BFDBFE' }} />
              <div className="text-[9px] text-slate-400 mt-0.5">0-1</div>
            </div>
          </div>
        </div>

        {/* Oui (Gold) buckets - left to right */}
        <div className="mb-3">
          <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-1.5">Oui (Gold)</div>
          <div className="flex gap-1">
            <div className="flex-1 text-center">
              <div className="h-5 rounded" style={{ backgroundColor: '#FDE68A' }} />
              <div className="text-[9px] text-slate-400 mt-0.5">0-1</div>
            </div>
            <div className="flex-1 text-center">
              <div className="h-5 rounded" style={{ backgroundColor: '#FCD34D' }} />
              <div className="text-[9px] text-slate-400 mt-0.5">1-3</div>
            </div>
            <div className="flex-1 text-center">
              <div className="h-5 rounded" style={{ backgroundColor: '#FBBF24' }} />
              <div className="text-[9px] text-slate-400 mt-0.5">3-5</div>
            </div>
            <div className="flex-1 text-center">
              <div className="h-5 rounded" style={{ backgroundColor: '#F59E0B' }} />
              <div className="text-[9px] text-slate-400 mt-0.5">5-10</div>
            </div>
            <div className="flex-1 text-center">
              <div className="h-5 rounded" style={{ backgroundColor: '#D97706' }} />
              <div className="text-[9px] text-slate-400 mt-0.5">10-20</div>
            </div>
            <div className="flex-1 text-center">
              <div className="h-5 rounded" style={{ backgroundColor: '#B45309' }} />
              <div className="text-[9px] text-slate-400 mt-0.5">20+</div>
            </div>
          </div>
        </div>

        {/* Status indicators */}
        <div className="pt-2 border-t border-slate-700 space-y-1.5">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-slate-600" />
            <span className="text-slate-300">No data yet</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded" style={{ backgroundColor: '#3B82F6', opacity: 0.7 }} />
            <span className="text-slate-300">Partial results (dimmed)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm">🔒</span>
            <span className="text-slate-300">Locked (&gt;98% + &gt;2pp)</span>
          </div>
        </div>
        
        <div className="mt-2 pt-2 border-t border-slate-700 text-[10px] text-slate-400">
          Height = margin strength
        </div>
      </div>

      {/* DeckGL */}
      <DeckGL
        viewState={viewState}
        onViewStateChange={({ viewState: vs }) => setViewState(vs as ViewState)}
        controller={true}
        layers={layers}
        getTooltip={({ object }: any) => {
          if (!object) return null;
          const name = object.properties?.NomCEP1992 || '';
          const riding = ridingData[name];
          if (!riding) return null;

          const leader = riding.ouiPct > riding.nonPct ? 'Oui' : 'Non';
          const leaderColor = riding.ouiPct > riding.nonPct ? '#D97706' : '#2563EB';
          const margin = Math.abs(riding.ouiPct - riding.nonPct);

          return {
            html: `
              <div style="font-family: system-ui; font-size: 11px; padding: 10px; background: rgba(17, 24, 39, 0.95); border: 1px solid #475569; border-radius: 6px; color: #F8FAFC;">
                <div style="font-weight: 600; margin-bottom: 6px; font-size: 12px;">${riding.circonscription}</div>
                
                <div style="display: flex; gap: 16px; margin-bottom: 6px;">
                  <div>
                    <span style="color: ${riding.ouiPct > riding.nonPct ? leaderColor : '#94A3B8'}; font-weight: ${riding.ouiPct > riding.nonPct ? '700' : '400'};">
                      Oui: ${riding.ouiPct.toFixed(1)}%
                    </span>
                  </div>
                  <div>
                    <span style="color: ${riding.nonPct > riding.ouiPct ? leaderColor : '#94A3B8'}; font-weight: ${riding.nonPct > riding.ouiPct ? '700' : '400'};">
                      Non: ${riding.nonPct.toFixed(1)}%
                    </span>
                  </div>
                </div>
                
                <div style="padding: 4px 8px; background: ${leaderColor}; color: white; border-radius: 4px; display: inline-block; font-size: 10px; font-weight: 600; margin-bottom: 6px;">
                  ${leader} +${margin.toFixed(1)}pp
                </div>
                
                <div style="margin-top: 6px; padding-top: 6px; border-top: 1px solid #334155; font-size: 10px; color: #CBD5E1;">
                  Counted: ${riding.countedPct.toFixed(0)}%${riding.locked ? ' 🔒 Locked' : ''}
                </div>
                
                ${riding.francophones1991 > 0 ? `
                  <div style="font-size: 10px; color: #94A3B8; margin-top: 4px;">
                    Francophones (1991): ${((riding.francophones1991 / (riding.francophones1991 + riding.anglophones1991 + riding.allophones1991)) * 100).toFixed(0)}%
                  </div>
                ` : ''}
              </div>
            `,
            style: {
              backgroundColor: 'transparent',
              padding: '0'
            }
          };
        }}
      />
    </div>
  );
};

export default Quebec1995Page;
