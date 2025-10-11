import React, { useEffect, useRef, useState } from 'react';
import * as echarts from 'echarts';
import TopBarChart from '../components/charts/TopBarChart';
import MarginHistogram from '../components/charts/MarginHistogram';
import VoteSharePie from '../components/charts/VoteSharePie';
import ReportingLine from '../components/charts/ReportingLine';
import CountyScatter from '../components/charts/CountyScatter';
import EvHistogram from '../components/charts/EvHistogram';
import BattlegroundBars from '../components/charts/BattlegroundBars';

// Dynamic Cesium loader (prefer existing installed module, fallback to global if already injected elsewhere)
async function getCesium(): Promise<any> {
  if ((window as any).Cesium) return (window as any).Cesium;
  try {
    const mod = await import('cesium');
    return (mod as any).Viewer ? mod : (window as any).Cesium;
  } catch {
    return (window as any).Cesium;
  }
}

interface StateAgg {
  state: string; // two-digit FIPS
  name: string;
  gop: number;
  dem: number;
  total: number;
  marginPctPoints: number; // dem - gop in percentage points (positive favors Dem, negative favors GOP)
}

interface CountyRuntime {
  fips: string;
  stateFips: string;
  dem: number;
  gop: number;
  other: number;
  total: number; // dem+gop+other
}

type LayerType = 'states' | 'counties'; // districts later
type QualityMode = 'performance' | 'balanced' | 'ultra';

// State metadata for strap (USPS abbr + 2024 EV). FIPS as keys.
const STATE_META: Record<string, { abbr: string; ev: number; name: string }> = {
  '01': { abbr: 'AL', ev: 9, name: 'Alabama' },
  '02': { abbr: 'AK', ev: 3, name: 'Alaska' },
  '04': { abbr: 'AZ', ev: 11, name: 'Arizona' },
  '05': { abbr: 'AR', ev: 6, name: 'Arkansas' },
  '06': { abbr: 'CA', ev: 54, name: 'California' },
  '08': { abbr: 'CO', ev: 10, name: 'Colorado' },
  '09': { abbr: 'CT', ev: 7, name: 'Connecticut' },
  '10': { abbr: 'DE', ev: 3, name: 'Delaware' },
  '11': { abbr: 'DC', ev: 3, name: 'District of Columbia' },
  '12': { abbr: 'FL', ev: 30, name: 'Florida' },
  '13': { abbr: 'GA', ev: 16, name: 'Georgia' },
  '15': { abbr: 'HI', ev: 4, name: 'Hawaii' },
  '16': { abbr: 'ID', ev: 4, name: 'Idaho' },
  '17': { abbr: 'IL', ev: 19, name: 'Illinois' },
  '18': { abbr: 'IN', ev: 11, name: 'Indiana' },
  '19': { abbr: 'IA', ev: 6, name: 'Iowa' },
  '20': { abbr: 'KS', ev: 6, name: 'Kansas' },
  '21': { abbr: 'KY', ev: 8, name: 'Kentucky' },
  '22': { abbr: 'LA', ev: 8, name: 'Louisiana' },
  '23': { abbr: 'ME', ev: 4, name: 'Maine' },
  '24': { abbr: 'MD', ev: 10, name: 'Maryland' },
  '25': { abbr: 'MA', ev: 11, name: 'Massachusetts' },
  '26': { abbr: 'MI', ev: 15, name: 'Michigan' },
  '27': { abbr: 'MN', ev: 10, name: 'Minnesota' },
  '28': { abbr: 'MS', ev: 6, name: 'Mississippi' },
  '29': { abbr: 'MO', ev: 10, name: 'Missouri' },
  '30': { abbr: 'MT', ev: 4, name: 'Montana' },
  '31': { abbr: 'NE', ev: 5, name: 'Nebraska' },
  '32': { abbr: 'NV', ev: 6, name: 'Nevada' },
  '33': { abbr: 'NH', ev: 4, name: 'New Hampshire' },
  '34': { abbr: 'NJ', ev: 14, name: 'New Jersey' },
  '35': { abbr: 'NM', ev: 5, name: 'New Mexico' },
  '36': { abbr: 'NY', ev: 28, name: 'New York' },
  '37': { abbr: 'NC', ev: 16, name: 'North Carolina' },
  '38': { abbr: 'ND', ev: 3, name: 'North Dakota' },
  '39': { abbr: 'OH', ev: 17, name: 'Ohio' },
  '40': { abbr: 'OK', ev: 7, name: 'Oklahoma' },
  '41': { abbr: 'OR', ev: 8, name: 'Oregon' },
  '42': { abbr: 'PA', ev: 19, name: 'Pennsylvania' },
  '44': { abbr: 'RI', ev: 4, name: 'Rhode Island' },
  '45': { abbr: 'SC', ev: 9, name: 'South Carolina' },
  '46': { abbr: 'SD', ev: 3, name: 'South Dakota' },
  '47': { abbr: 'TN', ev: 11, name: 'Tennessee' },
  '48': { abbr: 'TX', ev: 40, name: 'Texas' },
  '49': { abbr: 'UT', ev: 6, name: 'Utah' },
  '50': { abbr: 'VT', ev: 3, name: 'Vermont' },
  '51': { abbr: 'VA', ev: 13, name: 'Virginia' },
  '53': { abbr: 'WA', ev: 12, name: 'Washington' },
  '54': { abbr: 'WV', ev: 4, name: 'West Virginia' },
  '55': { abbr: 'WI', ev: 10, name: 'Wisconsin' },
  '56': { abbr: 'WY', ev: 3, name: 'Wyoming' },
};

export default function USElection2024Hier3DPage() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<any>(null);
  const [initError, setInitError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [layer, setLayer] = useState<LayerType>('states');
  const [qualityMode, setQualityMode] = useState<QualityMode>('balanced');
  const [drillStack, setDrillStack] = useState<string[]>([]); // state FIPS codes
  const stateAggRef = useRef<Record<string, StateAgg>>({});
  const countyStoreRef = useRef<Record<string, CountyRuntime>>({});
  const stateEntityRef = useRef<Record<string, any[]>>({});
  const countyEntityRef = useRef<Record<string, any[]>>({}); // entities for currently drilled state (may be multiple per county)
  const countyBench2020Ref = useRef<Record<string, { dem: number; gop: number; total: number; demPct: number; gopPct: number }>>({});
  const countyPotential2024Ref = useRef<Record<string, { total: number; name: string; stateFips: string }>>({});
  // Track currently selected states for multi-selection drilling
  const selectedStatesRef = useRef<Set<string>>(new Set());
  const dirtyStatesRef = useRef<Set<string>>(new Set());
  const globalMaxRef = useRef<number>(0);
  const [statusMsg, setStatusMsg] = useState('Initializing Cesium...');
  const [backendUrl, setBackendUrl] = useState<string>(import.meta.env.VITE_US_SIM_API || 'http://localhost:9090');
  const [connecting, setConnecting] = useState<boolean>(false);
  const [connected, setConnected] = useState<boolean>(false);
  const [lastEventTs, setLastEventTs] = useState<number>(0);
  const [simState, setSimState] = useState<any>(null);
  const reconnectAttemptRef = useRef<number>(0);
  const esRef = useRef<EventSource | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const pollTimerRef = useRef<any>(null);
  const restoredRef = useRef<boolean>(false);
  // Iowa-style shell: simple left side panel
  const [showPanel, setShowPanel] = useState<boolean>(true);
  const [showBottomPanel, setShowBottomPanel] = useState<boolean>(false);
  const [chartsVersion, setChartsVersion] = useState<number>(0); // force-chart re-renders
  // Bottom charts now use isolated components; no direct ECharts refs here
  // Monte Carlo latest result and controls
  const mcResultRef = useRef<any>(null);
  const [mcIterations, setMcIterations] = useState<number>(1000);
  const [mcSeed, setMcSeed] = useState<string>('');
  // Backend analytics summary cache (offloads heavy client-side aggregation)
  const analyticsSummaryRef = useRef<any>(null);
  const analyticsLastFetchRef = useRef<number>(0);
  // Reporting time series
  const reportingSeriesRef = useRef<Array<{ t: number; pct: number }>>([]);
  const reportingSeriesPerStateRef = useRef<Record<string, Array<{ t: number; pct: number }>>>({});
  // Hover tooltip for both layers
  const [hoverInfo, setHoverInfo] = useState<null | { x: number; y: number; type: 'state' | 'county'; name: string; dem: number; gop: number; total: number; demPct: number; gopPct: number; marginPts: number; reportingPct: number; ev?: number }>(null);
  // Keyboard shortcut: Ctrl+K toggles side panel
  useEffect(()=>{
    const onKey=(e:KeyboardEvent)=>{ if((e.ctrlKey||e.metaKey) && (e.key==='k' || e.key==='K')){ e.preventDefault(); setShowPanel(v=>!v); } };
    window.addEventListener('keydown', onKey);
    return ()=> window.removeEventListener('keydown', onKey);
  },[]);
  // Simulation mode: start with empty data (all neutral) and update via SSE if available
  const simulationMode = true; // set false to force static CSV aggregation mode

  // Simple diverging color scale buckets (points difference)
  const marginBuckets = [
    { max: -25, color: '#4b0d0d' },
    { max: -15, color: '#7f1414' },
    { max: -10, color: '#b71c1c' },
    { max: -5, color: '#e53935' },
    { max: -2, color: '#ef9a9a' },
    { max: 2, color: '#cccccc' }, // near tie / neutral
    { max: 5, color: '#90caf9' },
    { max: 10, color: '#42a5f5' },
    { max: 15, color: '#1e88e5' },
    { max: 25, color: '#1565c0' },
    { max: 999, color: '#0d47a1' }
  ];

  function colorForMargin(pointsDiff: number): string {
    for (const b of marginBuckets) {
      if (pointsDiff <= b.max) return b.color;
    }
    return '#888888';
  }

  // Apply scene quality presets
  function applyQualitySettings(viewer: any, mode: QualityMode) {
    try {
      const scene = viewer.scene;
      // Render mode and frame pacing
      if (mode === 'performance') {
        scene.requestRenderMode = true;
        scene.maximumRenderTimeChange = 0.5; // seconds
      } else if (mode === 'balanced') {
        scene.requestRenderMode = true;
        scene.maximumRenderTimeChange = 0.25;
      } else {
        // ultra: continuous
        scene.requestRenderMode = false;
        scene.maximumRenderTimeChange = 0.0;
      }
      // Anti-aliasing (msaaSamples only in WebGL2; fxaa as fallback)
      try { scene.msaaSamples = mode === 'ultra' ? 8 : (mode === 'balanced' ? 4 : 1); } catch {}
      try { scene.postProcessStages.fxaa.enabled = true; } catch {}
      // Shadows and visual effects (keep subtle)
      try { scene.shadowMap.enabled = (mode !== 'performance'); } catch {}
      try { scene.globe.showGroundAtmosphere = (mode !== 'performance'); } catch {}
      try { scene.fog.enabled = (mode !== 'ultra'); } catch {}
      // Depth testing
      try { scene.globe.depthTestAgainstTerrain = (mode === 'ultra'); } catch {}
      // Request a render to apply immediately
      try { scene.requestRender?.(); } catch {}
    } catch {}
  }

  // Load + init Cesium viewer
  useEffect(() => {
    if (!containerRef.current || viewerRef.current) return;
    (async () => {
      try {
        const Cesium = await getCesium();
        if (!Cesium) throw new Error('Cesium library unavailable');
        (window as any).CESIUM_BASE_URL = (window as any).CESIUM_BASE_URL || '/cesium/';
        const viewer = new Cesium.Viewer(containerRef.current, {
          timeline: false,
          animation: false,
          baseLayerPicker: false,
          geocoder: false,
          homeButton: false,
          navigationHelpButton: false,
          sceneModePicker: false,
          fullscreenButton: false,
          selectionIndicator: false,
          infoBox: false,
        });
  viewerRef.current = viewer;
  try { (window as any).__lastCesiumViewer = viewer; } catch {}
        try { viewer.imageryLayers.removeAll(); } catch {}
        // OSM base map layer
        try {
          viewer.imageryLayers.addImageryProvider(new Cesium.OpenStreetMapImageryProvider({
            url: 'https://tile.openstreetmap.org/'
          }));
        } catch(e) { console.warn('Failed adding OSM layer', e); }
        // Subtle dark space background (used outside globe horizon)
        viewer.scene.backgroundColor = Cesium.Color.fromCssColorString('#0a0d12');
        // Apply initial quality
        applyQualitySettings(viewer, qualityMode);
        // Initial camera over CONUS with a tilt so extrusions are visible
        const rect = Cesium.Rectangle.fromDegrees(-125, 23, -66, 50);
        viewer.camera.setView({ destination: rect, orientation: { heading: 0, pitch: -Cesium.Math.toRadians(60), roll: 0 } });
    setStatusMsg('Loading state geometry...');
    await loadStates();
    // Seed county potentials (2024 total_votes and names) from backend baselines once
    try { await seedPotentialsFromBackend(); } catch {}
        setLoading(false);
  setStatusMsg('Ready: Click a state to view 3D counties');
        // Initial chart render once DOM is ready
  try { setTimeout(() => { renderCharts(); }, 0); } catch {}
  // Prefetch analytics summary shortly after initial load
  try { setTimeout(() => { maybeFetchAnalyticsSummary(); }, 200); } catch {}
      } catch (e: any) {
        setInitError(e?.message || 'Failed to initialize');
        setLoading(false);
      }
    })();
    return () => {
      try { viewerRef.current?.destroy(); } catch {}
      try {
        // chart components handle their own dispose
      } catch {}
    };
  }, []);

  // Re-apply quality on mode change
  useEffect(()=>{
    if (viewerRef.current) applyQualitySettings(viewerRef.current, qualityMode);
  }, [qualityMode]);

  // Load and render state layer
  const loadStates = async () => {
    const Cesium = (window as any).Cesium; if (!Cesium || !viewerRef.current) return;
    setLayer('states');
    setDrillStack([]);
    const viewer = viewerRef.current;
    // Full reset of entities before rebuilding state layer
    viewer.entities.removeAll();
  stateEntityRef.current = {};
  countyEntityRef.current = {};
  try {
      const geoResp = await fetch('/gz_2010_us_040_00_500k.json');
      const geo = await geoResp.json();
      // Seed empty aggregates for all states present in geometry (simulation uses backend streams)
      if (!Object.keys(stateAggRef.current).length) {
        // Seed empty aggregates for all states present in geometry so we can update progressively
        const featsSeed = geo.features || [];
        for (const f of featsSeed) {
          const sf = f.properties?.STATE?.toString().padStart(2,'0');
          const name = f.properties?.NAME || sf;
            if (sf && !stateAggRef.current[sf]) {
              stateAggRef.current[sf] = { state: sf, name, gop: 0, dem: 0, total: 0, marginPctPoints: 0 };
            }
        }
      }
      const feats = geo.features || [];
      const Ces = Cesium;
      // Determine max total for extrusion scaling (square root compress)
      const maxTotal = Math.max(...Object.values(stateAggRef.current).map(a => a.total || 0));
      const baseHeight = 120000; // meters (peak extrusion)
      for (const f of feats) {
        const props = f.properties || {};
        const stateFips = props.STATE?.toString().padStart(2, '0');
        const name = props.NAME;
        const agg = stateAggRef.current[stateFips] || null;
        // Geometry may be MultiPolygon or Polygon
        const geom = f.geometry;
        if (!geom) continue;
        const { type, coordinates } = geom;
        const addPoly = (rings: number[][][]) => {
          if (!rings?.length) return;
          const outer = rings[0];
            const flat: number[] = [];
            for (const pt of outer) { if (pt.length >= 2) flat.push(pt[0], pt[1]); }
            if (flat.length < 6) return;
            const outerPos = Ces.Cartesian3.fromDegreesArray(flat);
            let hierarchy: any = outerPos;
            if (rings.length > 1) {
              const holes: any[] = [];
              for (let h = 1; h < rings.length; h++) {
                const hole = rings[h];
                const hflat: number[] = [];
                for (const hp of hole) { if (hp.length >= 2) hflat.push(hp[0], hp[1]); }
                if (hflat.length >= 6) holes.push(new Ces.PolygonHierarchy(Ces.Cartesian3.fromDegreesArray(hflat)));
              }
              hierarchy = new Ces.PolygonHierarchy(outerPos, holes);
            }
            const marginPts = agg ? agg.marginPctPoints : 0;
            const fillCss = agg ? colorForMargin(marginPts) : '#555555';
            const fill = Ces.Color.fromCssColorString(fillCss).withAlpha(0.9);
            let extrudedHeight = 0;
            if (agg && maxTotal > 0) {
              const norm = Math.sqrt(agg.total / maxTotal); // compress large states
              extrudedHeight = norm * baseHeight;
            }
            const ent = viewer.entities.add({
              name,
              polygon: {
                hierarchy,
                material: fill,
                outline: true,
                outlineColor: Ces.Color.fromCssColorString('#ffffff').withAlpha(0.6),
                height: 0,
                extrudedHeight
              },
              properties: {
                layer: 'state',
                stateFips,
                stateName: name,
                gop: agg?.gop ?? null,
                dem: agg?.dem ?? null,
                marginPts: agg?.marginPctPoints ?? null,
                originalColor: fillCss
              }
            });
            if (stateFips) {
              if (!stateEntityRef.current[stateFips]) stateEntityRef.current[stateFips] = [];
              stateEntityRef.current[stateFips].push(ent);
            }
        };
        if (type === 'MultiPolygon') {
          for (const poly of coordinates) addPoly(poly as any);
        } else if (type === 'Polygon') {
          addPoly(coordinates as any);
        }
      }
      attachInteraction();
      viewer.scene.requestRender();
    } catch (e: any) {
      console.error('State layer load error', e);
      setStatusMsg('Failed to load states');
    }
  };

  // Seed 2024 county potentials (total_votes) and names for reporting% using backend baselines
  const seedPotentialsFromBackend = async () => {
    const url = backendUrl.replace(/\/$/, '') + '/api/snapshot/counties';
    const snap = await fetch(url).then(r => r.json());
    const baselines = Array.isArray(snap?.baselines) ? snap.baselines : [];
    for (const b of baselines) {
      try {
        const fips = (b.fips || b.countyFips || '').toString().padStart(5,'0');
        if (!fips) continue;
        const total = b.totalVotes2024 ?? b.total_votes ?? b.total ?? 0;
        const name = b.countyName || b.county_name || fips;
        const stateFips = (b.stateFips || b.state_fips || fips.substring(0,2)).toString().padStart(2,'0');
        countyPotential2024Ref.current[fips] = { total: total||0, name, stateFips };
      } catch {}
    }
  };

  // Load 2020 county results and 2024 county potential totals
  const loadBenchmarks = async () => {
    try {
      // 2020 benchmark
      const text20 = await fetch('/2020_US_County_Level_Presidential_Results.csv').then(r => r.text());
      const lines20 = text20.split(/\r?\n/).filter(l => l.trim().length>0);
      if (lines20.length>1) {
        const h = lines20[0].split(',');
        const iF = h.indexOf('county_fips');
        const iG = h.indexOf('votes_gop');
        const iD = h.indexOf('votes_dem');
        for (let i=1;i<lines20.length;i++){
          const row = lines20[i].split(','); if (row.length!==h.length) continue;
          const fips = (row[iF]||'').padStart(5,'0'); if (!fips) continue;
          const g = parseInt(row[iG]||'0',10)||0; const d = parseInt(row[iD]||'0',10)||0; const t = g+d;
          const demPct = t>0? d/t*100:0; const gopPct = t>0? g/t*100:0;
          countyBench2020Ref.current[fips] = { dem:d, gop:g, total:t, demPct, gopPct };
        }
      }
      // 2024 potentials: use the 2024 file's total_votes as potential (or fallback to dem+gop)
      const text24 = await fetch('/2024_US_County_Level_Presidential_Results.csv').then(r => r.text());
      const lines24 = text24.split(/\r?\n/).filter(l => l.trim().length>0);
      if (lines24.length>1) {
        const h = lines24[0].split(',');
        const iF = h.indexOf('county_fips');
        const iN = h.indexOf('county_name');
        const iG = h.indexOf('votes_gop');
        const iD = h.indexOf('votes_dem');
        const iT = h.indexOf('total_votes');
        const iS = h.indexOf('state_fips')>-1? h.indexOf('state_fips') : -1;
        for (let i=1;i<lines24.length;i++){
          const row = lines24[i].split(','); if (row.length!==h.length) continue;
          const fips = (row[iF]||'').padStart(5,'0'); if (!fips) continue;
          const g = parseInt(row[iG]||'0',10)||0; const d = parseInt(row[iD]||'0',10)||0;
          const t = iT>=0? (parseInt(row[iT]||'0',10)|| (g+d)) : (g+d);
          const name = row[iN] || fips;
          const stateFips = iS>=0? (row[iS]||'').padStart(2,'0') : fips.substring(0,2);
          countyPotential2024Ref.current[fips] = { total: t, name, stateFips };
        }
      }
    } catch(e) {
      // optional benchmarks
    }
  };

  // Handle interaction (click for drill)
  const attachInteraction = () => {
    const Cesium = (window as any).Cesium; if (!Cesium || !viewerRef.current) return;
    const viewer = viewerRef.current;
    viewer.screenSpaceEventHandler.removeInputAction(Cesium.ScreenSpaceEventType.LEFT_CLICK);
    viewer.screenSpaceEventHandler.removeInputAction(Cesium.ScreenSpaceEventType.MOUSE_MOVE);
    viewer.screenSpaceEventHandler.setInputAction((movement: any) => {
      const picked = viewer.scene.pick(movement.position);
      if (!picked || !picked.id || !picked.id.properties) return;
      const props = picked.id.properties;
      // Allow drilling a state whether we're in states or counties mode (multi-select)
      const layerType = props.layer?.getValue?.();
      if (layerType === 'state') {
        const stateFips = props.stateFips?.getValue?.();
        if (stateFips) drillIntoState(stateFips);
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    // Hover tooltip for states and counties
    viewer.screenSpaceEventHandler.setInputAction((movement: any) => {
      try {
        const picked = viewer.scene.pick(movement.endPosition);
        if (!picked || !picked.id || !picked.id.properties) { setHoverInfo(null); return; }
        const props = picked.id.properties;
        const layerType = props.layer?.getValue?.();
        const pos = { x: movement.endPosition.x + 12, y: movement.endPosition.y + 12 };
        if (layer === 'states' && layerType === 'state') {
          const stateFips = props.stateFips?.getValue?.();
          if (!stateFips) { setHoverInfo(null); return; }
          const agg = stateAggRef.current[stateFips];
          const name = agg?.name || STATE_META[stateFips]?.name || props.stateName?.getValue?.() || stateFips;
          const dem = agg?.dem || 0; const gop = agg?.gop || 0; const total = dem + gop;
          const demPct = total>0 ? (dem/total)*100 : 0; const gopPct = total>0 ? (gop/total)*100 : 0;
          const marginPts = total>0 ? +(demPct - gopPct).toFixed(2) : 0;
          // Compute reporting from countyStore vs potentials
          let reported = 0, potential = 0;
          if (simulationMode) {
            for (const c of Object.values(countyStoreRef.current)) if (c.stateFips === stateFips) reported += (c.total || 0);
            for (const [fips, pot] of Object.entries(countyPotential2024Ref.current)) if (pot.stateFips === stateFips) potential += (pot.total || 0);
          }
          const reportingPct = potential>0 ? Math.min(100, (reported / potential) * 100) : 0;
          setHoverInfo({ ...pos, type: 'state', name, dem, gop, total, demPct, gopPct, marginPts, reportingPct, ev: STATE_META[stateFips]?.ev });
          return;
        }
        if (layer === 'counties' && layerType === 'county') {
          const countyFips = props.countyFips?.getValue?.();
          const countyName = props.countyName?.getValue?.() || picked.id?.name || 'County';
          let dem = 0, gop = 0, total = 0;
          if (simulationMode && countyFips && countyStoreRef.current[countyFips]) {
            const c = countyStoreRef.current[countyFips];
            dem = c.dem; gop = c.gop; total = c.total;
          } else {
            dem = props.dem?.getValue?.() || 0;
            gop = props.gop?.getValue?.() || 0;
            total = (dem + gop) || 0;
          }
          const demPct = total > 0 ? (dem / total) * 100 : 0;
          const gopPct = total > 0 ? (gop / total) * 100 : 0;
          const marginPts = total>0 ? +(demPct - gopPct).toFixed(2) : 0;
          let reportingPct = 0;
          if (countyFips && countyPotential2024Ref.current[countyFips]) {
            const pot = countyPotential2024Ref.current[countyFips];
            const t = total || 0;
            reportingPct = pot.total > 0 ? Math.min(100, (t / pot.total) * 100) : 0;
          }
          setHoverInfo({ ...pos, type: 'county', name: countyName, dem, gop, total, demPct, gopPct, marginPts, reportingPct });
          return;
        }
        setHoverInfo(null);
      } catch {
        setHoverInfo(null);
      }
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
  };

  // Drill into state: load counties for that state FIPS
  const drillIntoState = async (stateFips: string) => {
    setStatusMsg(`Loading 3D counties for state ${stateFips}...`);
    const Cesium = (window as any).Cesium; if (!Cesium || !viewerRef.current) return;
    const viewer = viewerRef.current;
    // Switch to counties mode after first selection
    if (layer !== 'counties') setLayer('counties');
    // If this state is already selected, do nothing
    if (selectedStatesRef.current.has(stateFips)) return;
    // Track selection order/stack for optional UI
    setDrillStack(prev => Array.from(new Set([...prev, stateFips])));
    selectedStatesRef.current.add(stateFips);
    // Remove only the clicked state's base state polygon(s) so counties can sit above; keep other states and any existing counties
    const toRemove: any[] = [];
    viewer.entities.values.forEach((ent: any) => {
      if (ent?.properties?.layer?.getValue && ent.properties.layer.getValue() === 'state') {
        const entState = ent.properties.stateFips?.getValue?.();
        if (entState === stateFips) toRemove.push(ent);
      }
    });
    toRemove.forEach((e: any) => viewer.entities.remove(e));
    try {
      // Fetch both state + county geo if needed (state outline from state file for cleaner geometry)
      const [stateGeoResp, countyGeoResp] = await Promise.all([
        fetch('/gz_2010_us_040_00_500k.json'),
        fetch('/gz_2010_us_050_00_500k.json')
      ]);
      const stateGeo = await stateGeoResp.json();
      const countyGeo = await countyGeoResp.json();
    const stateFeature = (stateGeo.features || []).find((f: any) => f?.properties?.STATE?.toString().padStart(2,'0') === stateFips);
  const feats = (countyGeo.features || []).filter((f: any) => f?.properties?.STATE?.toString().padStart(2, '0') === stateFips);
      if (stateFeature) {
        // Re-add state shell (flat, faint outline)
        const Ces = Cesium;
        const geom = stateFeature.geometry;
        if (geom) {
          const { type, coordinates } = geom;
          const addPoly = (rings: number[][][]) => {
            if (!rings?.length) return;
            const outer = rings[0];
            const flat: number[] = [];
            for (const pt of outer) if (pt.length >= 2) flat.push(pt[0], pt[1]);
            if (flat.length < 6) return;
            const outerPos = Ces.Cartesian3.fromDegreesArray(flat);
            let hierarchy: any = outerPos;
            if (rings.length > 1) {
              const holes: any[] = [];
              for (let h=1; h<rings.length; h++) {
                const hole = rings[h];
                const hf: number[] = [];
                for (const hp of hole) if (hp.length>=2) hf.push(hp[0], hp[1]);
                if (hf.length>=6) holes.push(new Ces.PolygonHierarchy(Ces.Cartesian3.fromDegreesArray(hf)));
              }
              hierarchy = new Ces.PolygonHierarchy(outerPos, holes);
            }
            // Add a subtle shell (kept to 2D flat) for the clicked state
            viewer.entities.add({
              name: stateFeature.properties?.NAME || stateFips,
              polygon: {
                hierarchy,
                material: Ces.Color.fromCssColorString('#ffffff').withAlpha(0.05),
                outline: true,
                outlineColor: Ces.Color.fromCssColorString('#ffffff').withAlpha(0.6),
                height: 0,
                extrudedHeight: 0
              },
              properties: { layer: 'state-shell', stateFips }
            });
          };
          if (type === 'MultiPolygon') {
            for (const poly of coordinates) addPoly(poly as any);
          } else if (type === 'Polygon') addPoly(coordinates as any);
        }
      }
      // In simulation mode, seed countyStore from backend snapshot so counties aren't grey until next tick
      if (simulationMode) {
        try {
          const snapUrl = backendUrl.replace(/\/$/, '') + '/api/snapshot/counties';
          const snap = await fetch(snapUrl).then(r => r.json());
          const runtimes = Array.isArray(snap?.runtimes) ? snap.runtimes : [];
          for (const r of runtimes) {
            try {
              const fips = (r.fips || r.countyFips || r.county_fips || '').toString().padStart(5,'0');
              if (!fips.startsWith(stateFips)) continue;
              const sf = (r.stateFips || r.state || fips.substring(0,2)).toString().padStart(2,'0');
              const dem = r.reportedDem ?? r.dem ?? r.votesDem ?? 0;
              const gop = r.reportedGop ?? r.gop ?? r.votesGop ?? 0;
              const total = r.reportedTotal ?? r.total ?? (dem + gop);
              const other = Math.max(0, total - dem - gop);
              countyStoreRef.current[fips] = { fips, stateFips: sf, dem, gop, other, total };
            } catch {}
          }
        } catch (e) { /* snapshot optional */ }
      }

      // Static CSV path removed; rely on live/snapshotted values
      const countyMap: Record<string, { gop: number; dem: number; total: number; marginPts: number; name: string; }> = {};

      // Determine max county total for extrusion scaling (within this state only)
      // - static mode: from CSV aggregation
      // - simulation mode: from current countyStoreRef values for this state
      const staticMax = Object.values(countyMap).reduce((m, v) => v.total > m ? v.total : m, 0) || 0;
      const simMax = (() => {
        if (!simulationMode) return 0;
        let max = 0;
        for (const c of Object.values(countyStoreRef.current)) {
          if (c.stateFips === stateFips && c.total > max) max = c.total;
        }
        return max;
      })();
      const maxCountyTotal = Math.max(staticMax, simMax);
      const countyBaseHeight = 90000; // meters peak for largest county
      for (const f of feats) {
        const props = f.properties || {};
        const countyFips = (props.STATE?.toString().padStart(2, '0') || '') + (props.COUNTY?.toString().padStart(3, '0') || '');
        const res = countyMap[countyFips];
        const geom = f.geometry; if (!geom) continue;
        const { type, coordinates } = geom;
        const addPoly = (rings: number[][][]) => {
          if (!rings?.length) return;
          const outer = rings[0];
          const flat: number[] = [];
          for (const pt of outer) if (pt.length >= 2) flat.push(pt[0], pt[1]);
          if (flat.length < 6) return;
          const outerPos = Cesium.Cartesian3.fromDegreesArray(flat);
          let hierarchy: any = outerPos;
          if (rings.length > 1) {
            const holes: any[] = [];
            for (let h = 1; h < rings.length; h++) {
              const hole = rings[h];
              const hf: number[] = [];
              for (const hp of hole) if (hp.length >= 2) hf.push(hp[0], hp[1]);
              if (hf.length >= 6) holes.push(new Cesium.PolygonHierarchy(Cesium.Cartesian3.fromDegreesArray(hf)));
            }
            hierarchy = new Cesium.PolygonHierarchy(outerPos, holes);
          }
          // Initial style: use live simulation values if available, otherwise static or neutral
          let initialTotal = 0;
          let initialMarginPts = 0;
          const c = countyStoreRef.current[countyFips];
          if (c) {
            initialTotal = c.total;
            if (initialTotal > 0) {
              const demPct = (c.dem / initialTotal) * 100;
              const gopPct = (c.gop / initialTotal) * 100;
              initialMarginPts = +(demPct - gopPct).toFixed(2);
            }
          }
          const fillCss = initialTotal > 0 ? colorForMargin(initialMarginPts) : '#666666';
          const fill = Cesium.Color.fromCssColorString(fillCss).withAlpha(0.95);
          let extrudedHeight = 0;
          const denom = maxCountyTotal > 0 ? maxCountyTotal : 0;
          const baseTotal = initialTotal > 0 ? initialTotal : 0;
          if (denom > 0 && baseTotal > 0) {
            const norm = Math.sqrt(baseTotal / denom);
            extrudedHeight = norm * countyBaseHeight;
          }
          const ent = viewer.entities.add({
            name: res?.name || props.NAME,
            polygon: {
              hierarchy,
              material: fill,
              outline: true,
              outlineColor: Cesium.Color.fromCssColorString('#222').withAlpha(0.6),
              height: 0,
              extrudedHeight
            },
            properties: {
              layer: 'county',
              countyFips,
              countyName: res?.name || props.NAME,
              gop: res?.gop ?? null,
              dem: res?.dem ?? null,
              marginPts: res?.marginPts ?? null,
            }
          });
          if (countyFips) {
            if (!countyEntityRef.current[countyFips]) countyEntityRef.current[countyFips] = [];
            countyEntityRef.current[countyFips].push(ent);
          }
        };
        if (type === 'MultiPolygon') {
          for (const poly of coordinates) addPoly(poly as any);
        } else if (type === 'Polygon') {
          addPoly(coordinates as any);
        }
      }

      attachInteraction();
      // Zoom to state extent only for the first selected state
      if (selectedStatesRef.current.size === 1) {
        try {
          let minLon = 999, minLat = 999, maxLon = -999, maxLat = -999;
          for (const f of feats) {
            const geom = f.geometry; if (!geom) continue;
            const coordsWalker = (arr: any) => {
              if (typeof arr[0] === 'number') { // coordinate pair
                const lon = arr[0]; const lat = arr[1];
                if (lon < minLon) minLon = lon; if (lon > maxLon) maxLon = lon;
                if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat;
                return;
              }
              for (const sub of arr) coordsWalker(sub);
            };
            coordsWalker(geom.coordinates);
          }
          if (minLon < 900) {
            const Ces = Cesium;
            const rect = Ces.Rectangle.fromDegrees(minLon, minLat, maxLon, maxLat);
            viewer.camera.flyTo({ destination: rect, duration: 0.85 });
          }
        } catch {}
      }
      setStatusMsg('3D counties loaded. Use Back to return to states.');
      // Start/refresh a light polling loop to force-refresh drilled states in case of sparse updates
      if (simulationMode) {
        if (pollTimerRef.current) { try { clearInterval(pollTimerRef.current); } catch {} }
        pollTimerRef.current = setInterval(async () => {
          try {
            const Cesium = (window as any).Cesium; if (!Cesium) return;
            // For each selected/drilled state, pull a snapshot and repaint
            for (const sf of selectedStatesRef.current) {
              const url = backendUrl.replace(/\/$/, '') + `/api/snapshot/counties?stateFips=${encodeURIComponent(sf)}`;
              const snap = await fetch(url).then(r => r.json()).catch(()=>null);
              const runtimes = Array.isArray(snap?.runtimes) ? snap.runtimes : [];
              let maxLocal = 0;
              for (const r of runtimes) {
                const f = (r.fips || r.countyFips || r.county_fips || '').toString().padStart(5,'0');
                const sfx = (r.stateFips || r.state || f.substring(0,2)).toString().padStart(2,'0');
                if (sfx !== sf) continue;
                const d = r.reportedDem ?? r.dem ?? 0;
                const g = r.reportedGop ?? r.gop ?? 0;
                const t = (r.reportedTotal ?? r.total ?? (d+g)) || 0;
                countyStoreRef.current[f] = { fips: f, stateFips: sfx, dem: d, gop: g, other: Math.max(0, t-d-g), total: t };
                if (t>maxLocal) maxLocal = t;
              }
              maxLocal = maxLocal || 1;
              // repaint all counties for this state
              Object.entries(countyEntityRef.current).forEach(([cf, ents]) => {
                const c = countyStoreRef.current[cf];
                if (!c || c.stateFips !== sf) return;
                const t = c.total || 0;
                let mPts = 0; if (t>0) { const dPct = (c.dem / t) * 100; const gPct = (c.gop / t) * 100; mPts = +(dPct - gPct).toFixed(2); }
                const css = t === 0 ? '#555555' : colorForMargin(mPts);
                const h = Math.sqrt(t / maxLocal) * 90000;
                for (const ent of (Array.isArray(ents) ? ents : [ents])) {
                  if (!ent?.polygon) continue;
                  ent.polygon.material = Cesium.Color.fromCssColorString(css).withAlpha(0.95);
                  ent.polygon.extrudedHeight = h;
                }
              });
            }
            viewerRef.current?.scene?.requestRender?.();
          } catch {}
        }, 5000);
      }
    } catch (e: any) {
      console.error('County drill error', e);
      setStatusMsg('Failed to load counties');
    }
  };

  const handleBack = () => {
    if (layer === 'counties') {
      if (pollTimerRef.current) { try { clearInterval(pollTimerRef.current); } catch {} pollTimerRef.current = null; }
      selectedStatesRef.current.clear();
      loadStates();
      setStatusMsg('Returned to states. Click a state to view 3D counties.');
    }
  };

  // Build shareable URL and restore from URL
  function buildShareUrl() {
    const url = new URL(window.location.href);
    url.searchParams.set('l', layer);
    const states = Array.from(selectedStatesRef.current);
    if (states.length) url.searchParams.set('s', states.join(',')); else url.searchParams.delete('s');
    url.searchParams.set('q', qualityMode);
    return url.toString();
  }
  function copyShareUrl() {
    const url = buildShareUrl();
    if (navigator.clipboard && (window.isSecureContext || window.location.protocol === 'https:')) {
      navigator.clipboard.writeText(url).then(()=> setStatusMsg('Link copied')).catch(()=> setStatusMsg('Copy failed'));
    } else {
      try { (window as any).prompt?.('Copy link:', url); } catch {}
    }
  }
  async function restoreFromUrl() {
    try {
      if (restoredRef.current) return;
      const url = new URL(window.location.href);
      const l = url.searchParams.get('l') as LayerType | null;
      const q = url.searchParams.get('q') as QualityMode | null;
      const s = url.searchParams.get('s');
      if (q && (q === 'performance' || q === 'balanced' || q === 'ultra')) setQualityMode(q);
      if (l === 'counties' && s) {
        const arr = s.split(',').map(v => v.trim()).filter(Boolean);
        for (const sf of arr) {
          try { await drillIntoState(sf); } catch {}
        }
        setLayer('counties');
      }
      restoredRef.current = true;
    } catch {}
  }
  // Persist URL on key changes
  useEffect(()=>{
    const url = buildShareUrl();
    try { window.history.replaceState({}, '', url); } catch {}
  }, [layer, drillStack, qualityMode]);
  // Restore after initial load
  useEffect(()=>{ if (!loading) restoreFromUrl(); }, [loading]);

  // --- Simulation streaming Hook: prefer WebSocket, fallback to SSE ---
  useEffect(() => {
    if (!simulationMode) return; // only active in simulation mode
    const Cesium = (window as any).Cesium;

    function applyCountyUpdate(u: any) {
      const fips = u.fips || u.countyFips || u.county_fips;
      if (!fips || fips.length < 5) return;
      const stateFips = fips.substring(0,2);
      const dem = u.reportedVotesDem ?? u.votes_dem ?? u.dem ?? u.rd ?? 0;
      const gop = u.reportedVotesGop ?? u.votes_gop ?? u.gop ?? u.rg ?? 0;
      const other = u.reportedVotesOther ?? u.votes_other ?? u.other ?? 0;
      countyStoreRef.current[fips] = { fips, stateFips, dem, gop, other, total: dem + gop + other };
      dirtyStatesRef.current.add(stateFips);

      // If currently drilled into this state and county entity exists, live-update polygon
      if (layer === 'counties' && countyEntityRef.current[fips] && Cesium) {
        // First, update this specific county's entities
        const ents = countyEntityRef.current[fips];
        const total = dem + gop + other;
        let marginPts = 0;
        if (total > 0) {
          const demPct = (dem / total) * 100;
          const gopPct = (gop / total) * 100;
          marginPts = +(demPct - gopPct).toFixed(2);
        }
        const fillCss = total === 0 ? '#555555' : colorForMargin(marginPts);
        for (const ent of (Array.isArray(ents) ? ents : [ents])) {
          if (!ent?.polygon) continue;
          ent.polygon.material = Cesium.Color.fromCssColorString(fillCss).withAlpha(0.95);
        }
        // Then, recompute state-local max and rescale ALL counties in this state so the heights keep animating
        let maxLocal = 0;
        const stateCountyFips = Object.keys(countyEntityRef.current).filter(cf => countyStoreRef.current[cf]?.stateFips === stateFips);
        for (const cf of stateCountyFips) {
          const c = countyStoreRef.current[cf];
          if (c && c.total > maxLocal) maxLocal = c.total;
        }
        maxLocal = maxLocal || 1;
        for (const cf of stateCountyFips) {
          const c = countyStoreRef.current[cf];
          const ents2 = countyEntityRef.current[cf];
          if (!c || !ents2) continue;
          const t = c.total || 0;
          const norm = Math.sqrt(t / maxLocal);
          // Update height; also refresh color based on current store (so non-updated counties still reflect latest totals)
          let mPts = 0; if (t>0) { const dPct = (c.dem / t) * 100; const gPct = (c.gop / t) * 100; mPts = +(dPct - gPct).toFixed(2); }
          const css = t === 0 ? '#555555' : colorForMargin(mPts);
          for (const ent of (Array.isArray(ents2) ? ents2 : [ents2])) {
            if (!ent?.polygon) continue;
            ent.polygon.extrudedHeight = norm * 90000;
            ent.polygon.material = Cesium.Color.fromCssColorString(css).withAlpha(0.95);
          }
        }
        // Force a repaint so updates are visible immediately (even if requestRenderMode is enabled)
        try { viewerRef.current?.scene?.requestRender?.(); } catch {}
      }
    }
    function recomputeState(stateFips: string) {
      const counties = Object.values(countyStoreRef.current).filter(c => c.stateFips === stateFips);
      if (!counties.length) return;
      let dem = 0, gop = 0, other = 0;
      for (const c of counties) { dem += c.dem; gop += c.gop; other += c.other; }
      const total = dem + gop + other;
      const agg = stateAggRef.current[stateFips];
      if (agg) {
        agg.dem = dem; agg.gop = gop; agg.total = total;
        if (agg.total > 0) {
          const demPct = (agg.dem / agg.total) * 100;
          const gopPct = (agg.gop / agg.total) * 100;
          agg.marginPctPoints = +(demPct - gopPct).toFixed(2);
        }
      }
    }
    function refreshVisuals() {
      if (!Cesium) return;
      // Recompute all dirty states
      if (dirtyStatesRef.current.size === 0) return;
      dirtyStatesRef.current.forEach(sf => recomputeState(sf));
      dirtyStatesRef.current.clear();
      // Recompute global max for extrusion scaling
      globalMaxRef.current = Math.max(...Object.values(stateAggRef.current).map(a => a.total || 0), 0);
      const max = globalMaxRef.current || 1;
      const baseHeight = 120000;
      Object.entries(stateEntityRef.current).forEach(([sf, ents]) => {
        const agg = stateAggRef.current[sf];
        if (!agg) return;
        const fillCss = agg.total === 0 ? '#555555' : colorForMargin(agg.marginPctPoints);
        let extruded = 0;
        if (agg.total > 0) {
          const norm = Math.sqrt(agg.total / max);
          extruded = norm * baseHeight;
        }
        for (const ent of (Array.isArray(ents) ? ents : [ents])) {
          if (!ent?.polygon) continue;
          ent.polygon.material = Cesium.Color.fromCssColorString(fillCss).withAlpha(agg.total === 0 ? 0.6 : 0.9);
          ent.polygon.extrudedHeight = extruded;
        }
      });
      viewerRef.current?.scene?.requestRender?.();
      // Update charts on changes
      try { renderCharts(); } catch {}
    }
    function applyStateAggregates(payload: any) {
      try {
        const arr = Array.isArray(payload) ? payload : (payload.states || payload);
        if (!Array.isArray(arr)) return;
        // Update local stateAggRef from backend authoritative values
        for (const s of arr) {
          const sf = (s.stateFips || s.state || s.state_fips || '').toString().padStart(2,'0');
          if (!sf) continue;
          const g = s.gop ?? s.votesGop ?? s.g ?? 0;
          const d = s.dem ?? s.votesDem ?? s.d ?? 0;
          const total = s.totalReported ?? s.total ?? (g + d);
          // Backend marginPct is (gop-dem)/total*100; our marginPctPoints is Dem% - GOP%
          let marginPts = 0;
          if (total > 0) {
            const demPct = (d / total) * 100;
            const gopPct = (g / total) * 100;
            marginPts = +(demPct - gopPct).toFixed(2);
          }
          const name = s.stateName || s.name || sf;
          stateAggRef.current[sf] = { state: sf, name, gop: g, dem: d, total, marginPctPoints: marginPts };
        }
        // After ingesting aggregates, refresh state visuals using these totals/colors directly
        // Recompute global max for extrusion scaling
        globalMaxRef.current = Math.max(...Object.values(stateAggRef.current).map(a => a.total || 0), 0);
        const max = globalMaxRef.current || 1;
        const baseHeight = 120000;
        Object.entries(stateEntityRef.current).forEach(([sf, ents]) => {
          const agg = stateAggRef.current[sf];
          if (!agg) return;
          const fillCss = agg.total === 0 ? '#555555' : colorForMargin(agg.marginPctPoints);
          let extruded = 0;
          if (agg.total > 0) {
            const norm = Math.sqrt(agg.total / max);
            extruded = norm * baseHeight;
          }
          for (const ent of (Array.isArray(ents) ? ents : [ents])) {
            if (!ent?.polygon) continue;
            ent.polygon.material = Cesium.Color.fromCssColorString(fillCss).withAlpha(agg.total === 0 ? 0.6 : 0.9);
            ent.polygon.extrudedHeight = extruded;
          }
        });
        viewerRef.current?.scene?.requestRender?.();
        // Update charts after aggregate changes
        try { renderCharts(); } catch {}
      } catch {}
    }
    function handleUnifiedEvent(evt: { event: string; data: any }) {
      const { event, data } = evt;
      switch (event) {
        case 'heartbeat':
          setLastEventTs(Date.now());
          break;
        case 'simulation-state':
          setSimState(data);
          setLastEventTs(Date.now());
          break;
        case 'national-totals':
          setLastEventTs(Date.now());
          break;
        case 'state-aggregates':
          applyStateAggregates(data);
          // Debounced analytics refresh from backend
          maybeFetchAnalyticsSummary();
          setLastEventTs(Date.now());
          break;
        case 'county-updates': {
          const arr = Array.isArray(data) ? data : (data.updates || data.deltas || data.d || []);
          for (const u of arr) applyCountyUpdate(u);
          refreshVisuals();
          setLastEventTs(Date.now());
          break;
        }
        case 'mc-latest': {
          mcResultRef.current = data;
          try { renderCharts(); } catch {}
          setLastEventTs(Date.now());
          break;
        }
        default:
          break;
      }
    }

    function connectWS() {
      try {
        const wsUrl = backendUrl.replace(/^http/i, 'ws').replace(/\/$/, '') + '/ws/election';
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;
        setConnecting(true);
        setStatusMsg('Connecting via WebSocket...');
        ws.onopen = () => {
          setConnecting(false);
          setConnected(true);
          reconnectAttemptRef.current = 0;
          setStatusMsg('WebSocket connected. Awaiting first county data...');
        };
        ws.onerror = () => {
          setConnected(false);
          ws.close();
        };
        ws.onclose = () => {
          // fallback to SSE on close if not connected
          if (!connected) connectSSE();
        };
        ws.onmessage = (m) => {
          try {
            const msg = JSON.parse(m.data);
            if (msg && typeof msg.event === 'string') {
              handleUnifiedEvent({ event: msg.event, data: msg.data });
            }
          } catch {}
        };
      } catch {
        connectSSE();
      }
    }

    function connectSSE() {
      if (esRef.current) { esRef.current.close(); esRef.current = null; }
      const url = backendUrl.replace(/\/$/, '') + '/api/stream/election-updates';
      setConnecting(true);
      setStatusMsg('Connecting to simulation stream...');
      const es = new EventSource(url);
      esRef.current = es;
      es.addEventListener('open', () => {
        setConnecting(false);
        setConnected(true);
        reconnectAttemptRef.current = 0;
        setStatusMsg('Simulation stream connected. Awaiting first county data...');
      });
      es.addEventListener('error', () => {
        setConnected(false);
        if (!connecting) setStatusMsg('Stream error. Reconnecting...');
        scheduleReconnect();
      });
      es.addEventListener('heartbeat', (evt: MessageEvent) => {
        setLastEventTs(Date.now());
      });
      es.addEventListener('simulation-state', (evt: MessageEvent) => {
        try {
          const p = JSON.parse(evt.data);
          handleUnifiedEvent({ event: 'simulation-state', data: p });
        } catch {}
      });
      es.addEventListener('national-totals', (evt: MessageEvent) => {
        try { const n = JSON.parse(evt.data); handleUnifiedEvent({ event: 'national-totals', data: n }); } catch {}
      });
      es.addEventListener('state-aggregates', (evt: MessageEvent) => {
        try {
          const payload = JSON.parse(evt.data);
          handleUnifiedEvent({ event: 'state-aggregates', data: payload });
        } catch {}
      });
      es.addEventListener('county-updates', (evt: MessageEvent) => {
        try {
          const payload = JSON.parse(evt.data);
          handleUnifiedEvent({ event: 'county-updates', data: payload });
        } catch(e) {/* ignore */}
      });
      es.addEventListener('mc-latest', (evt: MessageEvent) => {
        try {
          const payload = JSON.parse(evt.data);
          handleUnifiedEvent({ event: 'mc-latest', data: payload });
        } catch {}
      });
    }
    function scheduleReconnect() {
      const attempt = reconnectAttemptRef.current + 1;
      reconnectAttemptRef.current = attempt;
      const delay = Math.min(15000, 1000 * Math.pow(2, attempt));
      setTimeout(() => {
        if (!connected) connectSSE();
      }, delay);
    }
    // Try WS first; SSE as fallback
    connectWS();
    return () => {
      esRef.current?.close(); wsRef.current?.close();
      if (pollTimerRef.current) { try { clearInterval(pollTimerRef.current); } catch {} pollTimerRef.current = null; }
    };
  }, [simulationMode, backendUrl]);

  // Compute data for the top bar chart
  function getTopBarData() {
    if (layer === 'states') {
      // Prefer backend top states if available
      const s = analyticsSummaryRef.current;
      if (s && Array.isArray(s.topStates)) {
        const rows = s.topStates.map((r: any) => ({ key: r.stateFips || r.state || r.fips, name: r.name, dem: r.dem, gop: r.gop, total: r.total }));
        return { type: 'states' as const, rows, title: 'Top States by Reported Votes' };
      }
      const list = Object.values(stateAggRef.current).map(a => ({ key: a.state, name: a.name, dem: a.dem, gop: a.gop, total: a.total }));
      list.sort((a,b)=> b.total - a.total);
      return { type: 'states' as const, rows: list.slice(0, 12), title: 'Top States by Reported Votes' };
    }
    if (layer === 'counties') {
      const focusStateFips = drillStack.length ? drillStack[drillStack.length - 1] : null;
      if (!focusStateFips) return { type: 'none' as const, rows: [], title: '' };
      const rows: { key: string; name: string; dem: number; gop: number; total: number }[] = [];
      for (const [fips, c] of Object.entries(countyStoreRef.current)) {
        const cr = c as any;
        if (cr.stateFips === focusStateFips) {
          const name = countyPotential2024Ref.current[fips]?.name || cr.fips;
          rows.push({ key: fips, name, dem: cr.dem || 0, gop: cr.gop || 0, total: cr.total || 0 });
        }
      }
      rows.sort((a,b)=> b.total - a.total);
      const meta = STATE_META[focusStateFips];
      const agg = stateAggRef.current[focusStateFips];
      return { type: 'counties' as const, rows: rows.slice(0, 15), title: `Top Counties – ${meta?.name || agg?.name || focusStateFips}` };
    }
    return { type: 'none' as const, rows: [], title: '' };
  }
  // Helpers to init charts lazily
  function ensureChart(domRef: React.RefObject<HTMLDivElement | null>, instRef: React.MutableRefObject<any>) {
    if (!domRef.current) return null;
    if (!instRef.current) {
      instRef.current = echarts.init(domRef.current as HTMLDivElement, undefined, { renderer: 'canvas' });
    }
    return instRef.current;
  }
  // Backend analytics summary wiring
  async function fetchAnalyticsSummary() {
    try {
      const url = backendUrl.replace(/\/$/, '') + '/api/analytics/summary?topN=12';
      const resp = await fetch(url);
      if (!resp.ok) return;
      const json = await resp.json();
      analyticsSummaryRef.current = json;
      try { renderCharts(); } catch {}
    } catch {}
  }
  function maybeFetchAnalyticsSummary() {
    const now = Date.now();
    if (now - (analyticsLastFetchRef.current || 0) > 1500) {
      analyticsLastFetchRef.current = now;
      fetchAnalyticsSummary();
    }
  }
  function getBattlegrounds(mc: any) {
    const shortlist = ['13','55','26','42','04','32','37']; // GA, WI, MI, PA, AZ, NV, NC
    const rows: Array<{ fips: string; name: string; demProb: number }>=[];
    for (const sf of shortlist) {
      const dem = (mc?.demWinProb?.[sf] ?? 0) * 100;
      rows.push({ fips: sf, name: STATE_META[sf]?.abbr || sf, demProb: dem });
    }
    return rows;
  }
  function computeNationalTotals() {
    const s = analyticsSummaryRef.current;
    if (s) {
      const dem = s.nationalDem ?? 0;
      const gop = s.nationalGop ?? 0;
      const total = s.nationalTotal ?? (dem + gop);
      return { dem, gop, total };
    }
    let dem = 0, gop = 0;
    for (const a of Object.values(stateAggRef.current)) { dem += a.dem || 0; gop += a.gop || 0; }
    return { dem, gop, total: dem + gop };
  }
  function computeNationalReportingPct() {
    let reported = 0, potential = 0;
    for (const c of Object.values(countyStoreRef.current)) reported += (c.total || 0);
    for (const p of Object.values(countyPotential2024Ref.current)) potential += (p.total || 0);
    return potential > 0 ? (reported / potential) * 100 : (simState?.overallReportingPct ?? 0);
  }
  function pushReportingPoints() {
    const now = Date.now();
    const last = reportingSeriesRef.current[reportingSeriesRef.current.length - 1];
    const pct = computeNationalReportingPct();
    if (!last || now - last.t > 2000) {
      reportingSeriesRef.current.push({ t: now, pct });
      // cap size
      if (reportingSeriesRef.current.length > 600) reportingSeriesRef.current.shift();
    }
    // per-state for selected focus
    const focusStateFips = drillStack.length ? drillStack[drillStack.length - 1] : null;
    if (focusStateFips) {
      let rep = 0, pot = 0;
      for (const [fips, c] of Object.entries(countyStoreRef.current)) {
        if ((c as any).stateFips === focusStateFips) rep += (c as any).total || 0;
      }
      for (const p of Object.values(countyPotential2024Ref.current)) if (p.stateFips === focusStateFips) pot += (p.total || 0);
      const pctS = pot > 0 ? (rep / pot) * 100 : 0;
      const arr = reportingSeriesPerStateRef.current[focusStateFips] || (reportingSeriesPerStateRef.current[focusStateFips] = []);
      const lastS = arr[arr.length - 1];
      if (!lastS || now - lastS.t > 2000) {
        arr.push({ t: now, pct: pctS });
        if (arr.length > 600) arr.shift();
      }
    }
  }
  function renderCharts() {
    try {
      if (!showBottomPanel) return;
      // Keep push of reporting points (timeseries) in sync with our render cadence
      pushReportingPoints();
      // Nudge chart components to recompute props
      setChartsVersion(v=> v+1);
    } catch {}
  }
  // Resize charts when panel visibility changes or view changes
  useEffect(()=>{ if (showBottomPanel) { setTimeout(()=>renderCharts(), 0); } }, [showBottomPanel, layer, drillStack.length]);

  // Backend control actions
  async function apiPost(path: string) {
    try {
      const resp = await fetch(backendUrl.replace(/\/$/, '') + path, { method: 'POST' });
      if (!resp.ok) throw new Error(resp.status + ' ' + resp.statusText);
      const json = await resp.json().catch(()=>null);
      setStatusMsg(`OK: ${path}`);
      return json;
    } catch(e:any) { setStatusMsg(`Error ${path}: ${e.message}`); }
  }
  async function apiPostJson(path: string, body: any) {
    try {
      const resp = await fetch(backendUrl.replace(/\/$/, '') + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body||{}) });
      if (!resp.ok) throw new Error(resp.status + ' ' + resp.statusText);
      const json = await resp.json().catch(()=>null);
      setStatusMsg(`OK: ${path}`);
      return json;
    } catch(e:any) { setStatusMsg(`Error ${path}: ${e.message}`); }
  }
  const handleRunMC = async () => {
    const seed = mcSeed.trim().length ? Number(mcSeed.trim()) : undefined;
    await apiPostJson('/api/mc/run', { iterations: mcIterations, seed });
    try {
      const latest = await fetch(backendUrl.replace(/\/$/, '') + '/api/mc/latest').then(r => r.ok? r.json(): null).catch(()=>null);
      if (latest) { mcResultRef.current = latest; renderCharts(); }
    } catch {}
  };
  // Pass relative CSV path so backend finds it from its working dir
  const handleLoad = () => apiPost('/api/sim/load?path=..%2F2024_US_County_Level_Presidential_Results.csv');
  const handleStart = () => apiPost('/api/sim/start');
  const handleReset = () => apiPost('/api/sim/reset');
  const handleStop = () => apiPost('/api/sim/stop');

  // Derived UI values
  const connectionLabel = connected ? 'Connected' : (connecting ? 'Connecting...' : 'Disconnected');
  const stale = connected && lastEventTs && (Date.now() - lastEventTs > 15000);
  // Focus state for inspector (last drilled)
  const focusStateFips = layer === 'counties' && drillStack.length ? drillStack[drillStack.length - 1] : null;
  const focusAgg = focusStateFips ? stateAggRef.current[focusStateFips] : null;
  const focusMeta = focusStateFips ? STATE_META[focusStateFips] : null;
  return (
    <div className="w-screen h-screen fixed inset-0 bg-slate-950 text-slate-100 overflow-hidden">
      {/* Map container */}
      <div ref={containerRef} className="absolute inset-0" />
      {/* Init overlays */}
      {loading && <div className="absolute inset-0 flex items-center justify-center text-slate-400 text-xs bg-slate-950/80 z-10">Initializing 3D map…</div>}
      {initError && <div className="absolute top-3 left-3 z-30 px-3 py-1.5 rounded-md text-xs bg-rose-900/80 border border-rose-700 text-rose-100">{initError}</div>}

      {/* State inspector (when a single state is focused in counties view) */}
      {focusStateFips && (
        <div className="absolute top-3 left-3 z-20 rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2 text-[11px]">
          <div className="font-semibold">{focusMeta?.name || focusAgg?.name || focusStateFips} {focusMeta ? `(${focusMeta.abbr} · ${focusMeta.ev} EV)` : ''}</div>
          <div className="mt-1 text-slate-300">Dem: {focusAgg && focusAgg.total>0 ? ((focusAgg.dem / focusAgg.total) * 100).toFixed(1) : '0.0'}% · GOP: {focusAgg && focusAgg.total>0 ? ((focusAgg.gop / focusAgg.total) * 100).toFixed(1) : '0.0'}%</div>
          <div className="text-slate-400">Reporting: {simState?.overallReportingPct?.toFixed?.(1) ?? '—'}%</div>
        </div>
      )}

      {/* Hover tooltip (states and counties) */}
      {hoverInfo && (
        <div style={{ left: hoverInfo.x, top: hoverInfo.y }} className="absolute z-30 pointer-events-none rounded-md border border-slate-700 bg-slate-900/90 px-2 py-1.5 text-[11px] shadow">
          <div className="font-semibold leading-tight">{hoverInfo.name}{hoverInfo.type==='state' && hoverInfo.ev ? ` · ${hoverInfo.ev} EV` : ''}</div>
          <div className="text-slate-300 mt-0.5">Dem {hoverInfo.dem.toLocaleString()} ({hoverInfo.demPct.toFixed(1)}%) · GOP {hoverInfo.gop.toLocaleString()} ({hoverInfo.gopPct.toFixed(1)}%)</div>
          <div className="text-slate-400">Margin {hoverInfo.marginPts.toFixed(2)} pts · Reporting {hoverInfo.reportingPct.toFixed(1)}%</div>
        </div>
      )}

      {/* Show/Hide side panel */}
      <button onClick={()=>setShowPanel(p=>!p)} className="absolute top-3 right-3 z-30 px-3 py-1.5 rounded-md text-xs font-medium bg-slate-900/80 border border-slate-700 hover:border-slate-600 backdrop-blur">
        {showPanel ? 'Hide Panel' : 'Show Panel'}
      </button>
      {/* Toggle bottom charts panel */}
      <button onClick={()=>setShowBottomPanel(v=>!v)} className="absolute bottom-[360px] right-3 z-30 px-3 py-1.5 rounded-md text-xs font-medium bg-slate-900/80 border border-slate-700 hover:border-slate-600 backdrop-blur">
        {showBottomPanel ? 'Hide Charts' : 'Show Charts'}
      </button>

      {/* Side Panel */}
      <div className={`absolute top-0 left-0 h-full w-[330px] max-w-full bg-slate-950/88 border-r border-slate-800 backdrop-blur-xl transform transition-transform duration-300 z-20 overflow-y-auto ${showPanel? 'translate-x-0':'-translate-x-full'}`}>
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <h1 className="text-sm font-semibold tracking-wide">US Results 2024</h1>
          <span className="text-[10px] text-slate-500">Live</span>
        </div>
        <div className="p-5 space-y-6">
          <div>
            <div className="mb-2 text-[10px] uppercase tracking-wide text-slate-400">Views</div>
            <div className="flex gap-2 mb-4">
              <button onClick={()=>setLayer('states')} className={`flex-1 px-2 py-1 rounded-md text-[11px] border ${layer==='states'? 'bg-indigo-600 border-indigo-500 text-white':'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'}`}>States</button>
              <button onClick={()=>{ if (drillStack.length) setLayer('counties') }} className={`flex-1 px-2 py-1 rounded-md text-[11px] border ${layer==='counties'? 'bg-indigo-600 border-indigo-500 text-white':'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'}`}>Counties</button>
              {layer==='counties' && (<button onClick={handleBack} className="px-2 py-1 rounded-md text-[11px] border bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700">Back</button>)}
            </div>
            {/* Quality */}
            <div className="mt-2">
              <div className="mb-2 text-[10px] uppercase tracking-wide text-slate-400">Quality</div>
              <div className="grid grid-cols-3 gap-2 text-[11px]">
                <button onClick={()=>setQualityMode('performance')} className={`px-2 py-1 rounded-md border ${qualityMode==='performance'?'bg-emerald-700 border-emerald-600 text-white':'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'}`}>Perf</button>
                <button onClick={()=>setQualityMode('balanced')} className={`px-2 py-1 rounded-md border ${qualityMode==='balanced'?'bg-emerald-700 border-emerald-600 text-white':'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'}`}>Balanced</button>
                <button onClick={()=>setQualityMode('ultra')} className={`px-2 py-1 rounded-md border ${qualityMode==='ultra'?'bg-emerald-700 border-emerald-600 text-white':'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'}`}>Ultra</button>
              </div>
            </div>

            {/* Legend */}
            <div className="mt-4">
              <div className="mb-2 text-[10px] uppercase tracking-wide text-slate-400">Legend: Margin (Dem% − GOP%)</div>
              <div className="flex items-center gap-2 flex-wrap">
                {marginBuckets.map((b,i)=> (
                  <div key={i} className="flex items-center gap-1">
                    <span style={{background:b.color}} className="w-4 h-4 inline-block rounded-sm border border-slate-700" />
                    <span className="text-[11px] text-slate-300">{i===0?`≤ ${b.max}`: i===marginBuckets.length-1?`> ${marginBuckets[i-1].max}`:`≤ ${b.max}`}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div>
            <h2 className="font-medium mb-3 text-slate-200 text-sm tracking-wide">Backend</h2>
            <label className="text-[10px] uppercase tracking-wide text-slate-400">Endpoint</label>
            <input value={backendUrl} onChange={e=>setBackendUrl(e.target.value)} className="mt-1 w-full px-2 py-1 rounded-md text-[12px] bg-slate-900/70 border border-slate-700 focus:outline-none focus:border-slate-500" />
            <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
              <button onClick={handleLoad} className="px-2 py-1 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-700">Load</button>
              <button onClick={handleStart} className="px-2 py-1 rounded-md bg-emerald-600 hover:bg-emerald-500">Start</button>
              <button onClick={handleStop} className="px-2 py-1 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-700">Stop</button>
              <button onClick={handleReset} className="px-2 py-1 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-700">Reset</button>
              <button onClick={()=>{ reconnectAttemptRef.current = 0; setConnected(false); setConnecting(false); esRef.current?.close(); }} className="col-span-2 px-2 py-1 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-700">Reconnect</button>
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 text-xs">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] uppercase tracking-wide text-slate-400">Status</span>
              <span className="text-[10px] text-slate-500">{new Date().toLocaleTimeString()}</span>
            </div>
            <div className="space-y-1 text-slate-300">
              <div>Connection: {connectionLabel}{stale? ' (stale)':''}</div>
              <div>Reporting: {simState?.overallReportingPct?.toFixed?.(1) ?? '0.0'}%</div>
              <div>States loaded: {Object.keys(stateAggRef.current).length}</div>
              {selectedStatesRef.current.size>0 && <div>Selected: {Array.from(selectedStatesRef.current).join(', ')}</div>}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
              <button onClick={copyShareUrl} className="px-2 py-1 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-700">Copy Link</button>
              <button onClick={()=>capturePng()} className="px-2 py-1 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-700">Capture PNG</button>
            </div>
          </div>
          <div>
            <h2 className="font-medium mb-3 text-slate-200 text-sm tracking-wide">Projections</h2>
            <div className="grid grid-cols-3 gap-2 text-[11px]">
              <div>
                <label className="text-[10px] uppercase tracking-wide text-slate-400">Iterations</label>
                <input type="number" min={100} step={100} value={mcIterations} onChange={e=> setMcIterations(Math.max(100, parseInt(e.target.value||'100',10)))} className="mt-1 w-full px-2 py-1 rounded-md text-[12px] bg-slate-900/70 border border-slate-700 focus:outline-none focus:border-slate-500" />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wide text-slate-400">Seed (opt)</label>
                <input type="text" value={mcSeed} onChange={e=> setMcSeed(e.target.value)} placeholder="e.g. 42" className="mt-1 w-full px-2 py-1 rounded-md text-[12px] bg-slate-900/70 border border-slate-700 focus:outline-none focus:border-slate-500" />
              </div>
              <div className="flex items-end">
                <button onClick={handleRunMC} className="w-full px-2 py-1 rounded-md bg-indigo-600 hover:bg-indigo-500">Run MC</button>
              </div>
            </div>
            {mcResultRef.current && (
              <div className="mt-3 text-[11px] text-slate-300 grid grid-cols-3 gap-2">
                <div>EV Mean: {(mcResultRef.current.demEvMean??0).toFixed(0)}</div>
                <div>P50: {(mcResultRef.current.demEvP50??0).toFixed(0)}</div>
                <div>P95: {(mcResultRef.current.demEvP95??0).toFixed(0)}</div>
              </div>
            )}
          </div>
        </div>
      </div>
      {/* Bottom charts panel (scrollable with multiple visualizations) */}
      <div className={`absolute left-0 right-0 bottom-0 z-20 border-t border-slate-800 bg-slate-950/90 backdrop-blur-xl transition-transform duration-300 ${showBottomPanel? 'translate-y-0':'translate-y-[360px]'}`} style={{ height: 360 }}>
        <div className="h-full p-3 overflow-y-auto space-y-3">
          {/* Top stacked bar */}
          {(() => {
            const tb = getTopBarData();
            return (
              <TopBarChart
                key={`top-${chartsVersion}`}
                title={tb.title}
                categories={tb.rows.map((r:any)=> r.name)}
                dem={tb.rows.map((r:any)=> r.dem)}
                gop={tb.rows.map((r:any)=> r.gop)}
                height={180}
              />
            );
          })()}

          {/* Margin histogram */}
          {(() => {
            const bins: number[] = []; for (let x=-40; x<=40; x+=5) bins.push(x);
            const labels = bins.slice(0, bins.length-1).map((b,i)=> `${bins[i]} to ${bins[i+1]}`);
            // Render histo using current renderCharts() logic source: analyticsSummaryRef or fallback computation
            let values: number[] = new Array(labels.length).fill(0);
            if (layer === 'states') {
              const s = (analyticsSummaryRef as any).current;
              if (s && Array.isArray(s.binCounts)) values = Array.from(s.binCounts);
              else {
                const margins = Object.values(stateAggRef.current).map(a => a.total>0 ? ((a.dem / a.total) * 100 - (a.gop / a.total) * 100) : 0);
                for (const m of margins) { for (let i=0;i<bins.length-1;i++){ if (m>=bins[i] && m<bins[i+1]) { values[i]++; break; } } }
              }
            } else {
              const focus = drillStack.length ? drillStack[drillStack.length - 1] : null;
              if (focus) {
                const arr: number[] = [];
                for (const c of Object.values(countyStoreRef.current)) {
                  if ((c as any).stateFips !== focus) continue;
                  const t = (c as any).total || 0; if (t<=0) continue;
                  const dPct = ((c as any).dem / t) * 100; const gPct = ((c as any).gop / t) * 100;
                  arr.push(+(dPct - gPct).toFixed(2));
                }
                for (const m of arr) { for (let i=0;i<bins.length-1;i++){ if (m>=bins[i] && m<bins[i+1]) { values[i]++; break; } } }
              }
            }
            return <MarginHistogram key={`hist-${chartsVersion}`} title="Margin Distribution" labels={labels} values={values} height={150} />;
          })()}

          {/* Vote share pie & Reporting over time side-by-side on wide screens (stack on narrow) */}
          <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-3">
            {(() => {
              const t = computeNationalTotals();
              const title = layer === 'states' ? 'National Vote Share' : (()=>{
                const focus = drillStack.length ? drillStack[drillStack.length - 1] : null;
                return focus ? `Vote Share – ${STATE_META[focus]?.name || focus}` : 'Vote Share';
              })();
              let dem = t.dem, gop = t.gop;
              if (layer === 'counties') {
                const focus = drillStack.length ? drillStack[drillStack.length - 1] : null;
                if (focus) {
                  dem = 0; gop = 0;
                  for (const c of Object.values(countyStoreRef.current)) { if ((c as any).stateFips===focus) { dem+=(c as any).dem||0; gop+=(c as any).gop||0; } }
                }
              }
              return <VoteSharePie key={`pie-${chartsVersion}`} title={title} dem={dem} gop={gop} height={180} />;
            })()}
            {(() => {
              const focus = drillStack.length ? drillStack[drillStack.length - 1] : null;
              const series = (focus ? (reportingSeriesPerStateRef.current[focus] || []) : reportingSeriesRef.current).map(p => [p.t, +p.pct.toFixed(2)] as [number, number]);
              return <ReportingLine key={`line-${chartsVersion}`} title={focus? 'State Reporting Over Time' : 'National Reporting Over Time'} series={series} height={180} />;
            })()}
          </div>

          {/* Counties scatter (only populated in counties view) */}
          {(() => {
            if (layer !== 'counties') return <div className="w-full" style={{ height: 220 }} />;
            const focus = drillStack.length ? drillStack[drillStack.length - 1] : null;
            const points: Array<[number, number, number]> = [];
            if (focus) {
              const arr: Array<{ dem: number; gop: number; total: number }> = [];
              for (const c of Object.values(countyStoreRef.current)) { if ((c as any).stateFips===focus) arr.push({ dem: (c as any).dem||0, gop: (c as any).gop||0, total: (c as any).total||0 }); }
              arr.sort((a,b)=> b.total - a.total);
              for (const c of arr.slice(0, 200)) {
                const t = c.total || 0; if (t<=0) continue;
                const dPct = (c.dem / t) * 100; const gPct = (c.gop / t) * 100;
                points.push([gPct, dPct, t]);
              }
            }
            return <CountyScatter key={`scatter-${chartsVersion}`} title="County Scatter (GOP% vs Dem%)" points={points} height={220} />;
          })()}

          {/* Projections */}
          {(() => {
            const mc = mcResultRef.current;
            const hist = (mc && Array.isArray(mc.demEvHistogram)) ? mc.demEvHistogram as number[] : [];
            return <EvHistogram key={`ev-${chartsVersion}`} title="DEM Electoral Votes (MC)" histogram={hist} mean={mc?.demEvMean} p50={mc?.demEvP50} p95={mc?.demEvP95} height={200} />;
          })()}
          {(() => {
            const mc = mcResultRef.current;
            const shortlist = ['13','55','26','42','04','32','37'];
            const cats = shortlist.map(sf => STATE_META[sf]?.abbr || sf);
            const vals = shortlist.map(sf => ((mc?.demWinProb?.[sf] ?? 0) * 100));
            return <BattlegroundBars key={`win-${chartsVersion}`} title="Battlegrounds – Dem Win %" categories={cats} values={vals} height={180} />;
          })()}
        </div>
      </div>
    </div>
  );
}

// Capture current canvas to PNG (best-effort; may be blocked by CORS if imagery is cross-origin)
function capturePng() {
  try {
    const anyWindow = window as any;
    const viewer = (anyWindow.__lastCesiumViewer as any) || null;
    const canvas = viewer?.canvas || document.querySelector('canvas');
    if (!canvas) return;
    const data = (canvas as HTMLCanvasElement).toDataURL('image/png');
    const a = document.createElement('a');
    a.href = data; a.download = 'us_results.png';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  } catch (e) {
    // Ignore errors (likely CORS)
  }
}
