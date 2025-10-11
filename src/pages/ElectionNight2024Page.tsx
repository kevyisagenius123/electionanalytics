import React, { useEffect, useMemo, useRef, useState } from 'react'
import { getMarginColor } from '../lib/election/colors'
import { iowaMarginRgba, extrusionFromMarginIOWA, turnoutHeightFromVotesIOWA, clamp } from '../lib/election/swing'
import DeckGL from '@deck.gl/react'
import { GeoJsonLayer } from '@deck.gl/layers'
import { AmbientLight, LightingEffect, DirectionalLight } from '@deck.gl/core'
import type { FeatureCollection, Feature, Geometry } from 'geojson'
import { Client } from '@stomp/stompjs'
import SockJS from 'sockjs-client'

// --- 30-State Election Night Map ---
// Covers: 13 Midwest + 17 key states (battlegrounds, populous states)

// State metadata: code, name, FIPS prefix, county count
interface StateMetadata {
  code: string
  name: string
  fips: string
  totalCounties: number
}

const STATES: StateMetadata[] = [
  // Midwest (13)
  { code: 'IL', name: 'Illinois', fips: '17', totalCounties: 102 },
  { code: 'IN', name: 'Indiana', fips: '18', totalCounties: 92 },
  { code: 'IA', name: 'Iowa', fips: '19', totalCounties: 99 },
  { code: 'KS', name: 'Kansas', fips: '20', totalCounties: 105 },
  { code: 'MI', name: 'Michigan', fips: '26', totalCounties: 83 },
  { code: 'MN', name: 'Minnesota', fips: '27', totalCounties: 87 },
  { code: 'MO', name: 'Missouri', fips: '29', totalCounties: 115 },
  { code: 'NE', name: 'Nebraska', fips: '31', totalCounties: 93 },
  { code: 'ND', name: 'North Dakota', fips: '38', totalCounties: 53 },
  { code: 'OH', name: 'Ohio', fips: '39', totalCounties: 88 },
  { code: 'PA', name: 'Pennsylvania', fips: '42', totalCounties: 67 },
  { code: 'SD', name: 'South Dakota', fips: '46', totalCounties: 66 },
  { code: 'WI', name: 'Wisconsin', fips: '55', totalCounties: 72 },
  // Battlegrounds + Key States (17)
  { code: 'AZ', name: 'Arizona', fips: '04', totalCounties: 15 },
  { code: 'CA', name: 'California', fips: '06', totalCounties: 58 },
  { code: 'CO', name: 'Colorado', fips: '08', totalCounties: 64 },
  { code: 'FL', name: 'Florida', fips: '12', totalCounties: 67 },
  { code: 'GA', name: 'Georgia', fips: '13', totalCounties: 159 },
  { code: 'MA', name: 'Massachusetts', fips: '25', totalCounties: 14 },
  { code: 'MD', name: 'Maryland', fips: '24', totalCounties: 24 },
  { code: 'NC', name: 'North Carolina', fips: '37', totalCounties: 100 },
  { code: 'NJ', name: 'New Jersey', fips: '34', totalCounties: 21 },
  { code: 'NM', name: 'New Mexico', fips: '35', totalCounties: 33 },
  { code: 'NV', name: 'Nevada', fips: '32', totalCounties: 17 },
  { code: 'NY', name: 'New York', fips: '36', totalCounties: 62 },
  { code: 'OR', name: 'Oregon', fips: '41', totalCounties: 36 },
  { code: 'TX', name: 'Texas', fips: '48', totalCounties: 254 },
  { code: 'VA', name: 'Virginia', fips: '51', totalCounties: 133 },
  { code: 'WA', name: 'Washington', fips: '53', totalCounties: 39 },
  { code: 'WV', name: 'West Virginia', fips: '54', totalCounties: 55 },
  // South (9)
  { code: 'AL', name: 'Alabama', fips: '01', totalCounties: 67 },
  { code: 'AR', name: 'Arkansas', fips: '05', totalCounties: 75 },
  { code: 'KY', name: 'Kentucky', fips: '21', totalCounties: 120 },
  { code: 'LA', name: 'Louisiana', fips: '22', totalCounties: 64 },
  { code: 'MS', name: 'Mississippi', fips: '28', totalCounties: 82 },
  { code: 'OK', name: 'Oklahoma', fips: '40', totalCounties: 77 },
  { code: 'SC', name: 'South Carolina', fips: '45', totalCounties: 46 },
  { code: 'TN', name: 'Tennessee', fips: '47', totalCounties: 95 },
  { code: 'DC', name: 'District of Columbia', fips: '11', totalCounties: 1 },
  // Northeast (6)
  { code: 'CT', name: 'Connecticut', fips: '09', totalCounties: 8 },
  { code: 'DE', name: 'Delaware', fips: '10', totalCounties: 3 },
  { code: 'ME', name: 'Maine', fips: '23', totalCounties: 16 },
  { code: 'NH', name: 'New Hampshire', fips: '33', totalCounties: 10 },
  { code: 'RI', name: 'Rhode Island', fips: '44', totalCounties: 5 },
  { code: 'VT', name: 'Vermont', fips: '50', totalCounties: 14 },
  // West/Mountain (6)
  { code: 'AK', name: 'Alaska', fips: '02', totalCounties: 30 },
  { code: 'HI', name: 'Hawaii', fips: '15', totalCounties: 5 },
  { code: 'ID', name: 'Idaho', fips: '16', totalCounties: 44 },
  { code: 'MT', name: 'Montana', fips: '30', totalCounties: 56 },
  { code: 'UT', name: 'Utah', fips: '49', totalCounties: 29 },
  { code: 'WY', name: 'Wyoming', fips: '56', totalCounties: 23 }
];

// Basic view state
interface ViewState { longitude: number; latitude: number; zoom: number; pitch?: number; bearing?: number }

// Backend frame county structure
interface CountyFrame {
  fipsCode: string
  countyName: string
  percentReported: number // backend gives percent (0..1 or 0..100) – we normalize to 0..1
  currentTrumpVotes: number
  currentHarrisVotes: number
  leader: string
  leaderMargin: number
}

interface StateFrame {
  stateCode: string  // "PA", "MI", or "WI"
  stateName: string
  totalTrumpVotes: number
  totalHarrisVotes: number
  leader: string
  marginPercentage: number
  percentReported: number
  counties: CountyFrame[]
}

interface PAFrameDTO {
  sequenceNumber: number
  simulationSecond: number
  timestamp: string
  totalTrumpVotes: number
  totalHarrisVotes: number
  leader: string
  marginPercentage: number
  states: StateFrame[]  // PA, MI, WI state snapshots
  counties: CountyFrame[]  // Legacy flat list (deprecated)
}

// Color function: blend blue->red based on vote share, opacity increases w/ reporting
function paColor(trumpVotes: number, harrisVotes: number, reporting: number): [number,number,number,number] {
  if (reporting <= 0.005) return [140,155,175,160];
  const total = trumpVotes + harrisVotes;
  if (total === 0) return [140,155,175,160];
  const tp = trumpVotes / total; // 0..1
  const r = Math.round(tp * 255 + (1 - tp) * 30);
  const g = Math.round(tp * 40  + (1 - tp) * 80);
  const b = Math.round(tp * 60  + (1 - tp) * 200);
  const a = Math.round(180 + 60 * Math.min(1, reporting));
  return [r,g,b,a];
}

function formatElectionTime(seconds: number): string {
  const start = new Date('2024-11-05T20:00:00-05:00'); // 8PM ET
  const cur = new Date(start.getTime() + seconds*1000);
  const h = cur.getHours();
  const m = cur.getMinutes().toString().padStart(2,'0');
  const ampm = h >= 12 ? 'PM':'AM';
  const displayH = h % 12 || 12;
  return `${displayH}:${m} ${ampm} ET`;
}

const ElectionNight2024Page: React.FC = () => {
  // DeckGL camera - centered to show all 50 states + DC (including Alaska and Hawaii)
  const [viewState, setViewState] = useState<ViewState>({
    longitude: -98.0,  // Slightly west to balance Alaska
    latitude: 39.5,    // Slightly north
    zoom: 3.8,         // Zoomed out to show entire country including Alaska
    pitch: 45,
    bearing: 0
  });

  // GeoJSON refs for all counties and 30 states
  const countiesRef = useRef<FeatureCollection | null>(null);
  const stateRefs = useRef<Record<string, Feature<Geometry, any> | null>>(
    STATES.reduce((acc, s) => ({ ...acc, [s.code]: null }), {})
  );

  // Playback + frame state
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(100); // 10x logical default
  const [maxTime, setMaxTime] = useState(28800); // 8 hours
  const [totalFrames, setTotalFrames] = useState(0);
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0);
  const wsClientRef = useRef<Client | null>(null);

  // County results map
  const [countiesState, setCountiesState] = useState<Map<string, CountyFrame>>(new Map());

  // UI / display
  const [hoveredCounty, setHoveredCounty] = useState<string|null>(null);
  const [hoveredState, setHoveredState] = useState<string|null>(null); // 'PA' | 'MI' | 'WI' | null
  const [mousePos, setMousePos] = useState({x:0,y:0});
  const [status, setStatus] = useState('Loading map...');
  const [heightScale, setHeightScale] = useState(1.0);
  const [fillAlpha, setFillAlpha] = useState(235);
  const [extrusionMode, setExtrusionMode] = useState<'margin'|'turnout'|'hybrid'>('hybrid');
  const [hybridWeight, setHybridWeight] = useState(60); // percent margin in hybrid
  const [selectedStates, setSelectedStates] = useState<Set<string>>(
    new Set(STATES.map(s => s.code)) // All 30 states visible by default
  );

  // Load counties + all 30 state polygons
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [countiesData, stateData] = await Promise.all([
          fetch('/gz_2010_us_050_00_500k.json').then(r=>r.json()),
          fetch('/gz_2010_us_040_00_500k.json').then(r=>r.json())
        ]);
        if (!active) return;
        
        // Load counties for all 30 states
        const fipsSet = new Set(STATES.map(s => s.fips));
        countiesRef.current = {
          ...countiesData,
          features: countiesData.features.filter((f: any) => {
            const code = f.properties?.GEO_ID?.slice(-5) || f.properties?.FIPS || f.properties?.GEOID;
            if (!code) return false;
            // Check if county belongs to any of our 30 states
            return Array.from(fipsSet).some(fips => code.startsWith(fips));
          })
        };
        
        // Load all 30 state boundaries
        STATES.forEach(state => {
          const feature = stateData.features.find((f: any) => 
            f.properties && (f.properties.STATE === state.fips || f.properties.NAME === state.name)
          );
          if (feature) stateRefs.current[state.code] = feature;
        });
        
        setStatus(`Map ready - 30 states loaded (2,273 counties)`);
      } catch (e) {
        console.error(e);
        setStatus('Failed loading map');
      }
    })();
    return () => { active = false };
  }, []);

  // WebSocket connection for real-time updates
  useEffect(() => {
    const client = new Client({
      webSocketFactory: () => new SockJS('https://national-election-backend-977058061007.us-central1.run.app/pa-websocket'),
      reconnectDelay: 5000,
      heartbeatIncoming: 4000,
      heartbeatOutgoing: 4000,
      onConnect: () => {
        console.log('WebSocket connected');
        setStatus('Connected to backend');
        
        // Subscribe to frame updates
        client.subscribe('/topic/pa/frames', (message) => {
          try {
            console.log('Received WebSocket frame:', message.body.substring(0, 100));
            const frame: PAFrameDTO = JSON.parse(message.body);
            const map = new Map<string, CountyFrame>();
            
            // Process states array (preferred) or fallback to flat counties
            const states = frame.states || [];
            if (states.length > 0) {
              // New format: iterate through PA, MI, WI states
              states.forEach(state => {
                (state.counties || []).forEach(c => {
                  map.set(c.fipsCode, {
                    ...c,
                    percentReported: Math.min(1, c.percentReported > 1 ? c.percentReported/100 : c.percentReported)
                  });
                });
              });
            } else {
              // Legacy flat format
              (frame.counties||[]).forEach(c => {
                map.set(c.fipsCode, {
                  ...c,
                  percentReported: Math.min(1, c.percentReported > 1 ? c.percentReported/100 : c.percentReported)
                });
              });
            }
            setCountiesState(map);
            setCurrentTime(frame.simulationSecond);
            setCurrentFrameIndex(frame.sequenceNumber);
            setStatus(`${frame.timestamp} • ${(frame.totalTrumpVotes+frame.totalHarrisVotes).toLocaleString()} votes`);
            console.log(`Frame ${frame.sequenceNumber}: ${frame.counties.length} counties, ${frame.totalTrumpVotes + frame.totalHarrisVotes} total votes`);
          } catch (e) {
            console.error('Failed to parse frame:', e);
          }
        });
      },
      onStompError: (frame) => {
        console.error('WebSocket error:', frame);
        setStatus('WebSocket error');
      },
      onWebSocketClose: () => {
        console.log('WebSocket closed');
        setStatus('Disconnected');
      }
    });

    client.activate();
    wsClientRef.current = client;

    // Fetch initial status and total frames
    fetch('https://national-election-backend-977058061007.us-central1.run.app/api/pa/status')
      .then(r => r.json())
      .then(data => {
        setTotalFrames(data.totalFrames);
        setCurrentFrameIndex(data.currentFrame);
      })
      .catch(e => console.error('Failed to fetch status:', e));

    return () => {
      if (client.active) {
        client.deactivate();
      }
    };
  }, []);

  // Pull latest PA frame (backend authoritative time). Poll while playing.
  useEffect(() => {
    let active = true;
    async function pull() {
      try {
        const res = await fetch('https://national-election-backend-977058061007.us-central1.run.app/api/pa/frame/current');
        if (!res.ok) { setStatus('Backend offline'); return; }
        const frame: PAFrameDTO = await res.json();
        if (!active) return;
        const map = new Map<string, CountyFrame>();
        (frame.counties||[]).forEach(c => {
          map.set(c.fipsCode, {
            ...c,
            percentReported: Math.min(1, c.percentReported > 1 ? c.percentReported/100 : c.percentReported)
          });
        });
        setCountiesState(map);
        setCurrentTime(frame.simulationSecond);
        setStatus(`${frame.timestamp} • ${(frame.totalTrumpVotes+frame.totalHarrisVotes).toLocaleString()} votes`);
      } catch (e) {
        if (active) setStatus('Fetch error');
      }
    }
    // Initial fetch
    pull();
    return () => { active = false };
  }, []);

  // Control functions
  const handlePlayPause = async () => {
    try {
      if (isPlaying) {
        console.log('Stopping playback...');
        await fetch('https://national-election-backend-977058061007.us-central1.run.app/api/pa/stop', { method: 'POST' });
        setIsPlaying(false);
      } else {
        console.log('Starting playback...');
        const response = await fetch('https://national-election-backend-977058061007.us-central1.run.app/api/pa/start', { method: 'POST' });
        const data = await response.json();
        console.log('Start response:', data);
        setIsPlaying(true);
      }
    } catch (e) {
      console.error('Failed to toggle playback:', e);
    }
  };

  const handleReset = async () => {
    try {
      setIsPlaying(false);
      await fetch('https://national-election-backend-977058061007.us-central1.run.app/api/pa/reset', { method: 'POST' });
      setCurrentTime(0);
      setCurrentFrameIndex(0);
      setCountiesState(new Map()); // Clear county data
      // Don't change selectedStates - keep counties hidden if they were hidden
    } catch (e) {
      console.error('Failed to reset:', e);
    }
  };

  const handleSpeedChange = async (newSpeed: number) => {
    try {
      setSpeed(newSpeed);
      await fetch(`https://national-election-backend-977058061007.us-central1.run.app/api/pa/speed?speed=${Math.max(1, Math.floor(newSpeed/10))}`, { method: 'POST' });
    } catch (e) {
      console.error('Failed to set speed:', e);
    }
  };

  const handleTimelineSeek = async (frameIndex: number) => {
    try {
      const res = await fetch(`https://national-election-backend-977058061007.us-central1.run.app/api/pa/frame/${frameIndex}`);
      if (res.ok) {
        const frame: PAFrameDTO = await res.json();
        const map = new Map<string, CountyFrame>();
        (frame.counties||[]).forEach(c => {
          map.set(c.fipsCode, {
            ...c,
            percentReported: Math.min(1, c.percentReported > 1 ? c.percentReported/100 : c.percentReported)
          });
        });
        setCountiesState(map);
        setCurrentTime(frame.simulationSecond);
        setCurrentFrameIndex(frame.sequenceNumber);
        setStatus(`${frame.timestamp} • ${(frame.totalTrumpVotes+frame.totalHarrisVotes).toLocaleString()} votes`);
      }
    } catch (e) {
      console.error('Failed to seek:', e);
    }
  };

  // Local UI timer (optional feel of time progression)
  useEffect(() => {
    if (!isPlaying) return;
    const id = setInterval(() => {
      setCurrentTime(t => Math.min(maxTime, t + speed/10));
    }, 250);
    return () => clearInterval(id);
  }, [isPlaying, speed, maxTime]);

  // Helper function to create a state layer for PA, MI, or WI
  const createStateLayer = (stateCode: string, stateRef: Feature<Geometry, any> | null, fipsPrefix: string) => {
    if (!stateRef) return null;
    
    // Calculate state totals from counties with matching FIPS prefix
    let totalTrump = 0, totalHarris = 0;
    countiesState.forEach((c, fips) => {
      if (fips.startsWith(fipsPrefix)) {
        totalTrump += c.currentTrumpVotes;
        totalHarris += c.currentHarrisVotes;
      }
    });
    const totalVotes = totalTrump + totalHarris;
    let marginPct = 0;
    if (totalVotes > 0) {
      marginPct = ((totalTrump - totalHarris) / totalVotes) * 100;
    }
    
    const isSelected = selectedStates.has(stateCode);
    const targetAlpha = isSelected ? 0 : clamp(Math.min(fillAlpha, 220), 30, 255);
    const targetHeight = isSelected ? 0 : extrusionFromMarginIOWA(marginPct) * heightScale * 0.6;
    
    return new GeoJsonLayer<Feature<Geometry, any>>({
      id: `${stateCode.toLowerCase()}-state`,
      data: stateRef,
      stroked: true,
      filled: true,
      extruded: true,
      parameters: ({ depthTest: true } as any),
      getFillColor: (f: any) => {
        // Recalculate margin from current county data
        let totalTrump = 0, totalHarris = 0;
        countiesState.forEach((c, fips) => {
          if (fips.startsWith(fipsPrefix)) {
            totalTrump += c.currentTrumpVotes;
            totalHarris += c.currentHarrisVotes;
          }
        });
        const totalVotes = totalTrump + totalHarris;
        const margin = totalVotes > 0 ? ((totalTrump - totalHarris) / totalVotes) * 100 : 0;
        // Use same alpha as county layer for consistent colors
        const alpha = selectedStates.has(stateCode) ? 0 : clamp(fillAlpha, 30, 255);
        return iowaMarginRgba(margin, alpha);
      },
      getElevation: (f: any) => {
        // Recalculate margin for height
        let totalTrump = 0, totalHarris = 0;
        countiesState.forEach((c, fips) => {
          if (fips.startsWith(fipsPrefix)) {
            totalTrump += c.currentTrumpVotes;
            totalHarris += c.currentHarrisVotes;
          }
        });
        const totalVotes = totalTrump + totalHarris;
        const margin = totalVotes > 0 ? ((totalTrump - totalHarris) / totalVotes) * 100 : 0;
        return selectedStates.has(stateCode) ? 0 : extrusionFromMarginIOWA(margin) * heightScale * 0.6;
      },
      getLineColor: (f: any) => {
        const alpha = selectedStates.has(stateCode) ? 0 : 255;
        return [255, 255, 255, alpha] as [number, number, number, number];
      },
      lineWidthMinPixels: 1.6,
      pickable: true,
      onClick: () => {
        // Toggle selection
        setSelectedStates(prev => {
          const next = new Set(prev);
          if (next.has(stateCode)) {
            next.delete(stateCode);
          } else {
            next.add(stateCode);
          }
          return next;
        });
      },
      onHover: (info: any) => setHoveredState(info.object ? stateCode : null),
      transitions: {
        getElevation: { duration: 800, easing: (t: number) => t * t * (3 - 2 * t) },
        getFillColor: { duration: 600 },
        getLineColor: { duration: 600 }
      },
      updateTriggers: { 
        getFillColor: [countiesState, fillAlpha, selectedStates], 
        getElevation: [countiesState, heightScale, selectedStates],
        getLineColor: [selectedStates]
      }
    });
  };

  // All 30 state layers (created dynamically)
  const stateLayers = useMemo(() => {
    return STATES.map(state => 
      createStateLayer(state.code, stateRefs.current[state.code], state.fips)
    ).filter(layer => layer !== null);
  }, [stateRefs.current, countiesState, fillAlpha, heightScale, selectedStates]);

  // County layer (shows counties for ALL selected states)
  const countyLayer = useMemo(() => {
    if (!countiesRef.current || selectedStates.size === 0) return null;
    
    // Get FIPS prefixes for all selected states (30 total)
    const fipsPrefixes: string[] = STATES
      .filter(s => selectedStates.has(s.code))
      .map(s => s.fips);
    
    // Filter counties for selected states
    const selectedStateCounties = {
      ...countiesRef.current,
      features: countiesRef.current.features.filter((f: any) => {
        const code = f.properties?.GEO_ID?.slice(-5) || f.properties?.FIPS || f.properties?.GEOID;
        return code && fipsPrefixes.some(prefix => code.startsWith(prefix));
      })
    };
    
    return new GeoJsonLayer<Feature<Geometry, any>>({
      id: 'selected-counties',
      data: selectedStateCounties,
      filled: true,
      extruded: true,
      wireframe: false,
      pickable: true,
      stroked: true,
      parameters: ({ depthTest: false } as any),
      getFillColor: (f: any) => {
        const code = f.properties?.GEO_ID?.slice(-5) || f.properties?.FIPS || f.properties?.GEOID;
        const c = countiesState.get(code);
        if (!c) return [100, 116, 139, 180];
        
        // Calculate margin and use Iowa-style color
        const margin = c.currentTrumpVotes + c.currentHarrisVotes > 0 
          ? ((c.currentTrumpVotes - c.currentHarrisVotes) / (c.currentTrumpVotes + c.currentHarrisVotes)) * 100 
          : 0;
        return iowaMarginRgba(margin, clamp(fillAlpha, 30, 255));
      },
      getElevation: (f: any) => {
        const code = f.properties?.GEO_ID?.slice(-5) || f.properties?.FIPS || f.properties?.GEOID;
        const c = countiesState.get(code);
        const base = 1000;
        if (!c) return base;
        
        // Margin and turnout heights (Iowa-style)
        const margin = c.currentTrumpVotes + c.currentHarrisVotes > 0 
          ? ((c.currentTrumpVotes - c.currentHarrisVotes) / (c.currentTrumpVotes + c.currentHarrisVotes)) * 100 
          : 0;
        const marginHeight = extrusionFromMarginIOWA(margin);
        const turnoutHeight = turnoutHeightFromVotesIOWA(c.currentTrumpVotes + c.currentHarrisVotes, 1, 1);
        
        let h = 0;
        if (extrusionMode === 'margin') h = marginHeight;
        else if (extrusionMode === 'turnout') h = turnoutHeight;
        else {
          // Hybrid
          const w = clamp(hybridWeight, 0, 100) / 100;
          h = w * marginHeight + (1 - w) * turnoutHeight;
        }
        
        // Extra lift while in county view (like Rust Belt does)
        const lift = 1.75;
        return h * clamp(heightScale, 0.1, 3) * lift;
      },
      getLineColor: [255,255,255,200],
      lineWidthMinPixels: 0.5,
      transitions: {
        getFillColor: { duration: 600 },
        getElevation: { duration: 1000, enter: () => 0 }
      },
      updateTriggers: { 
        getFillColor: [countiesState, fillAlpha], 
        getElevation: [countiesState, heightScale, extrusionMode, hybridWeight] 
      },
      onHover: (info: any) => {
        if (info.object) {
          const code = info.object.properties?.GEO_ID?.slice(-5) || info.object.properties?.FIPS || info.object.properties?.GEOID;
          setHoveredCounty(code);
          setMousePos({x: info.x, y: info.y});
        } else setHoveredCounty(null);
      }
    });
  }, [countiesRef.current, countiesState, heightScale, fillAlpha, extrusionMode, hybridWeight, selectedStates]);

  // State border layers (show outlines for ALL selected states when viewing counties)
  const stateBorderLayer = useMemo(() => {
    if (selectedStates.size === 0) return null;
    
    const borderFeatures: Feature<Geometry, any>[] = STATES
      .filter(s => selectedStates.has(s.code) && stateRefs.current[s.code])
      .map(s => stateRefs.current[s.code]!);
    
    if (borderFeatures.length === 0) return null;
    
    return new GeoJsonLayer<Feature<Geometry, any>>({
      id: 'state-borders',
      data: { type: 'FeatureCollection', features: borderFeatures } as FeatureCollection,
      stroked: true,
      filled: false,
      extruded: false,
      getLineColor: [255,255,255,255],
      lineWidthMinPixels: 1.6,
      pickable: true,
      onClick: (info: any) => {
        // Clicking border deselects all states
        setSelectedStates(new Set());
      }
    });
  }, [stateRefs.current, selectedStates]);

  const layers = useMemo(() => {
    const arr: any[] = [];
    // Add all state layers
    stateLayers.forEach(layer => { if (layer) arr.push(layer); });
    // County layer on top
    if (countyLayer) arr.push(countyLayer);
    // State borders last
    if (stateBorderLayer) arr.push(stateBorderLayer);
    return arr;
  }, [stateLayers, countyLayer, stateBorderLayer]);

  return (
    <div className="w-screen h-screen fixed inset-0 bg-slate-950 text-slate-100">
      {/* Status + controls */}
      <div className="absolute top-3 left-3 z-30 flex gap-3 items-center">
        <a href="/" className="px-3 py-1.5 rounded-md text-xs font-medium bg-slate-900/80 border border-slate-700 hover:border-slate-600">← Home</a>
        <span className="text-[11px] text-slate-300">{status}</span>
        {selectedStates.size > 0 && (
          <button 
            onClick={() => setSelectedStates(new Set())} 
            className="px-2 py-1 text-[10px] rounded bg-slate-800/70 border border-slate-700 hover:bg-slate-700"
          >
            ← Hide All Counties ({selectedStates.size} state{selectedStates.size > 1 ? 's' : ''})
          </button>
        )}
      </div>

      <div className="absolute top-3 right-3 z-30 flex gap-2">
        <button
          onClick={handlePlayPause}
          className="px-3 py-1.5 rounded-md text-xs font-medium bg-blue-600 hover:bg-blue-700"
        >{isPlaying ? 'Pause' : 'Play'}</button>
        <button
          onClick={handleReset}
          className="px-3 py-1.5 rounded-md text-xs font-medium bg-slate-800 border border-slate-600 hover:border-slate-500"
        >Reset</button>
        <select
          value={speed}
          onChange={e => handleSpeedChange(parseInt(e.target.value))}
          className="text-xs bg-slate-800 border border-slate-600 rounded px-2"
        >
          <option value={10}>1x</option>
          <option value={50}>5x</option>
          <option value={100}>10x</option>
            <option value={200}>20x</option>
          <option value={500}>50x</option>
        </select>
        <div className="px-2 py-1 text-[10px] bg-slate-800/70 rounded border border-slate-700 font-mono">{formatElectionTime(currentTime)}</div>
        <div className="px-2 py-1 text-[10px] bg-slate-800/70 rounded border border-slate-700 font-mono">Frame {currentFrameIndex}/{totalFrames}</div>
      </div>

      {/* Timeline Slider */}
      <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 z-30 w-3/4 max-w-4xl bg-slate-900/90 border border-slate-700 rounded-lg p-4">
        <div className="flex items-center gap-4">
          <button
            onClick={handleReset}
            className="px-2 py-1 text-xs bg-slate-800 border border-slate-600 rounded hover:bg-slate-700"
          >⏮</button>
          <button
            onClick={handlePlayPause}
            className="px-3 py-1 text-xs bg-blue-600 rounded hover:bg-blue-700"
          >{isPlaying ? '⏸' : '▶'}</button>
          <div className="flex-1">
            <input
              type="range"
              min="0"
              max={Math.max(1, totalFrames - 1)}
              value={currentFrameIndex}
              onChange={e => handleTimelineSeek(parseInt(e.target.value))}
              disabled={totalFrames === 0}
              className="w-full"
              style={{ accentColor: '#3b82f6' }}
            />
            <div className="flex justify-between text-[10px] text-slate-400 mt-1">
              <span>8:00 PM ET</span>
              <span>{formatElectionTime(currentTime)}</span>
              <span>4:00 AM ET</span>
            </div>
          </div>
        </div>
      </div>

      {/* Sliders */}
      <div className="absolute top-16 right-3 z-30 w-56 bg-slate-900/85 border border-slate-700 rounded-lg p-3 space-y-3">
        <div>
          <label className="text-[11px] text-slate-300 mb-1 block">County Height Scale</label>
          <input type="range" min="0.1" max="3" step="0.1" value={heightScale} onChange={e=>setHeightScale(parseFloat(e.target.value))} className="w-full" />
        </div>
        <div>
          <label className="text-[11px] text-slate-300 mb-1 block">Opacity</label>
          <input type="range" min="120" max="255" step="5" value={fillAlpha} onChange={e=>setFillAlpha(parseInt(e.target.value))} className="w-full" />
        </div>
        <div>
          <label className="text-[11px] text-slate-300 mb-1 block">Extrusion Mode</label>
          <select value={extrusionMode} onChange={e=>setExtrusionMode(e.target.value as any)} className="w-full text-xs bg-slate-800 border border-slate-600 rounded px-2">
            <option value="margin">Margin</option>
            <option value="turnout">Turnout</option>
            <option value="hybrid">Hybrid</option>
          </select>
        </div>
        {extrusionMode === 'hybrid' && (
          <div>
            <label className="text-[11px] text-slate-300 mb-1 block">Hybrid: % Margin</label>
            <input type="range" min="0" max="100" step="1" value={hybridWeight} onChange={e=>setHybridWeight(parseInt(e.target.value))} className="w-full" />
          </div>
        )}
      </div>

      {/* State Tooltip - Only show when hovering and no counties are visible */}
      {hoveredState && selectedStates.size === 0 && (()=>{
        // Map state code to FIPS prefix and metadata (using STATES constant)
        const stateInfo = STATES.reduce((acc, s) => ({
          ...acc,
          [s.code]: { name: s.name, fipsPrefix: s.fips, totalCounties: s.totalCounties }
        }), {} as Record<string, {name: string, fipsPrefix: string, totalCounties: number}>);
        
        const info = stateInfo[hoveredState];
        if (!info) return null;

        let totalTrump = 0, totalHarris = 0, totalReporting = 0, totalCounties = 0;
        let sumPercentReported = 0;
        // Filter counties by the hovered state's FIPS prefix
        countiesState.forEach((c, fips) => { 
          if (fips.startsWith(info.fipsPrefix)) {
            totalTrump += c.currentTrumpVotes; 
            totalHarris += c.currentHarrisVotes;
            sumPercentReported += c.percentReported;
            if (c.percentReported > 0) totalReporting++;
            totalCounties++;
          }
        });
        const totalVotes = totalTrump + totalHarris;
        // Calculate average percent reported across all counties
        const percentReported = totalCounties > 0 ? (sumPercentReported / totalCounties) * 100 : 0;
        const trumpPct = totalVotes > 0 ? (totalTrump / totalVotes) * 100 : 0;
        const harrisPct = totalVotes > 0 ? (totalHarris / totalVotes) * 100 : 0;
        const margin = trumpPct - harrisPct;
        
        return (
          <div className="absolute z-40 pointer-events-none" style={{left: mousePos.x + 14, top: mousePos.y + 14}}>
            <div className="bg-slate-900/95 border border-slate-600 rounded px-3 py-2 text-[11px] space-y-1 shadow-2xl">
              <div className="font-semibold text-slate-100">{info.name}</div>
              {totalVotes > 0 ? <>
                <div className="text-slate-400">{percentReported.toFixed(0)}% reporting ({totalReporting}/{info.totalCounties} counties)</div>
                <div className="flex justify-between gap-4">
                  <span className="text-red-400">Trump</span>
                  <span className="font-mono">{totalTrump.toLocaleString()}</span>
                  <span className="text-slate-500">{trumpPct.toFixed(1)}%</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-blue-400">Harris</span>
                  <span className="font-mono">{totalHarris.toLocaleString()}</span>
                  <span className="text-slate-500">{harrisPct.toFixed(1)}%</span>
                </div>
                <div className="pt-1 border-t border-slate-700 text-slate-300">
                  Margin: <span className={margin > 0 ? 'text-red-400' : 'text-blue-400'}>
                    {margin > 0 ? 'R' : 'D'}+{Math.abs(margin).toFixed(1)}%
                  </span>
                </div>
              </> : <div className="text-slate-500">No results yet</div>}
            </div>
          </div>
        );
      })()}

      {/* County Tooltip */}
      {hoveredCounty && (()=>{ const c = countiesState.get(hoveredCounty); return (
        <div className="absolute z-40 pointer-events-none" style={{left: mousePos.x + 14, top: mousePos.y + 14}}>
          <div className="bg-slate-900/95 border border-slate-600 rounded px-3 py-2 text-[11px] space-y-1 shadow-2xl">
            <div className="font-semibold text-slate-100">{c?.countyName || 'County '+hoveredCounty}</div>
            {c ? <>
              <div className="text-slate-400">{(c.percentReported*100).toFixed(0)}% reporting</div>
              <div className="flex justify-between"><span className="text-red-400">R</span><span className="font-mono">{c.currentTrumpVotes.toLocaleString()}</span></div>
              <div className="flex justify-between"><span className="text-blue-400">D</span><span className="font-mono">{c.currentHarrisVotes.toLocaleString()}</span></div>
            </>:<div className="text-slate-500">No results yet</div>}
          </div>
        </div>
      )})()}

      {/* DeckGL */}
      <DeckGL
        viewState={viewState}
        onViewStateChange={({viewState}) => setViewState(viewState as ViewState)}
        controller={true}
        layers={layers}
        effects={[new LightingEffect({
          ambient: new AmbientLight({color:[255,255,255], intensity:1.4}),
          directional: new DirectionalLight({color:[255,255,255], intensity:2.2, direction:[-1,-1,-2]})
        })]}
        style={{position:'absolute', inset:'0'}}
      />
    </div>
  )
}

export default ElectionNight2024Page
