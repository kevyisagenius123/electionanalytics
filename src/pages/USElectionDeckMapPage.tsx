import React, { useEffect, useMemo, useRef, useState } from 'react'
import DeckGL from '@deck.gl/react'
import { GeoJsonLayer } from '@deck.gl/layers'
import type { FeatureCollection, Feature, Geometry } from 'geojson'

type ViewState = {
  longitude: number
  latitude: number
  zoom: number
  pitch?: number
  bearing?: number
}
// Shared type for state aggregates across functions
type StateAgg = {
  stateFips: string
  stateName?: string
  marginPct: number
  reportingPct?: number // 0-100
  gop?: number
  dem?: number
  totalReported?: number
  gopShare?: number // 0-1
  demShare?: number // 0-1
}

const to2 = (v: unknown): string | null => (v == null ? null : v.toString().padStart(2, '0'))

const BACKEND_BASE = (import.meta as any)?.env?.VITE_US_SIM_API ?? 'http://localhost:9090'

type CountyUpdateDto = {
  fips: string
  gop: number
  dem: number
  total: number
  reportingPct: number // 0-100
  marginPct: number // -100..100
  leader: 'GOP' | 'DEM' | 'TIED' | 'NONE'
  ts: number
  color?: string
  extrusion?: number
}

function hexToRgba(h: string, alpha = 255): [number, number, number, number] {
  try {
    const s = h.replace('#', '')
    const n = parseInt(s.length === 3 ? s.split('').map(c => c + c).join('') : s, 16)
    const r = (n >> 16) & 255
    const g = (n >> 8) & 255
    const b = n & 255
    return [r, g, b, alpha]
  } catch {
    return [136, 136, 136, alpha]
  }
}

// Florida simulation color scheme adapted for RGB arrays
const FL_REDS = [
  '#FFC4C4', '#FFA0A0', '#FF7070', '#E03B2F', '#B51400', '#730900'
]
const FL_BLUES = [
  '#B7C8FF', '#8FAEFF', '#5D90FF', '#2D6BFF', '#0047D6', '#001E5C'
]
const FL_NEUTRAL = '#4a4a4a'

function lerp(a: number, b: number, t: number) { return a + (b - a) * t }
function hexToRgb(h: string): [number, number, number] {
  const [r,g,b,] = hexToRgba(h, 255); return [r,g,b]
}
function blendHex(aHex: string, bHex: string, t: number): [number, number, number, number] {
  const A = hexToRgb(aHex), B = hexToRgb(bHex)
  const r = Math.round(lerp(A[0], B[0], t))
  const g = Math.round(lerp(A[1], B[1], t))
  const bb = Math.round(lerp(A[2], B[2], t))
  return [r, g, bb, 255]
}

function flMarginColor(leader: 'GOP' | 'DEM' | 'TIED' | 'NONE', marginPct: number, reportingPct: number): [number, number, number, number] {
  if (leader === 'TIED' || leader === 'NONE' || marginPct <= 0) return hexToRgba(FL_NEUTRAL, 255)
  const m = Math.abs(marginPct)
  const idx = m < 1 ? 0 : m < 5 ? 1 : m < 10 ? 2 : m < 20 ? 3 : m < 30 ? 4 : 5
  const baseHex = leader === 'GOP' ? FL_REDS[idx] : FL_BLUES[idx]
  // Progressive fade logic: full color at 80%+, blend at lower reporting
  if (reportingPct >= 80) return hexToRgba(baseHex, 230)
  const r01 = reportingPct > 1 ? Math.min(1, reportingPct / 100) : Math.max(0, Math.min(1, reportingPct))
  const t = Math.min(1, Math.max(0, r01 / 0.5))
  const amt = 0.55 + 0.45 * t
  return blendHex(FL_NEUTRAL, baseHex, amt)
}

// Unified helper: build a CountyUpdateDto from raw runtime row with baseline fallback logic.
// Guarantees we never downgrade a fully-colored baseline (reportingPct=100) back to 0.
function buildCountyUpdate(raw: any, baselineMap: Map<string, any>, existing?: CountyUpdateDto): CountyUpdateDto | null {
  if (!raw) return null
  const fips = String((raw?.fips ?? raw?.FIPS ?? raw?.geoid ?? raw?.countyFips) || '').slice(-5)
  if (!fips) return null

  let gop = raw?.gop ?? raw?.reportedGop ?? 0
  let dem = raw?.dem ?? raw?.reportedDem ?? 0
  let totalVotes = raw?.total ?? raw?.reportedTotal ?? (gop + dem)
  let reportingPct = raw?.reportingPct ?? raw?.reportedPct ?? 0

  // Normalize 0-1 to 0-100
  if (reportingPct > 0 && reportingPct <= 1) reportingPct = reportingPct * 100

  const baseline = baselineMap.get(fips)
  const shouldUseBaseline = totalVotes === 0 || (baseline && reportingPct < 5)

  if (shouldUseBaseline && baseline) {
    gop = baseline.votesGop2024 ?? 0
    dem = baseline.votesDem2024 ?? 0
    totalVotes = baseline.totalVotes2024 ?? (gop + dem)
    reportingPct = 100
  } else if (baseline && reportingPct < 100) {
    // runtime partial; keep as-is
  }

  // Prevent overwriting an existing baseline (100%) with zero-progress runtime packet
  if (existing && existing.reportingPct === 100 && reportingPct === 0) {
    return null
  }

  const leader: 'GOP' | 'DEM' | 'TIED' | 'NONE' = gop > dem ? 'GOP' : dem > gop ? 'DEM' : totalVotes > 0 ? 'TIED' : 'NONE'
  const marginPct = totalVotes > 0 ? ((gop - dem) / totalVotes) * 100 : 0
  return { fips, gop, dem, total: totalVotes, reportingPct, leader, marginPct, ts: Date.now() }
}

// Electoral Votes by state FIPS (2024-2028 apportionment)
// Note: Maine (23) and Nebraska (31) split EV by congressional district. This panel assigns EV by the current state leader
// as a first pass. Future enhancement: support CD-level splits when CD aggregates are available.
const EV_BY_FIPS: Record<string, number> = {
  '01': 9,   // AL
  '02': 3,   // AK
  '04': 11,  // AZ
  '05': 6,   // AR
  '06': 54,  // CA
  '08': 10,  // CO
  '09': 7,   // CT
  '10': 3,   // DE
  '11': 3,   // DC
  '12': 30,  // FL
  '13': 16,  // GA
  '15': 4,   // HI
  '16': 4,   // ID
  '17': 19,  // IL
  '18': 11,  // IN
  '19': 6,   // IA
  '20': 6,   // KS
  '21': 8,   // KY
  '22': 8,   // LA
  '23': 4,   // ME (split; treating as bloc for now)
  '24': 10,  // MD
  '25': 11,  // MA
  '26': 15,  // MI
  '27': 10,  // MN
  '28': 6,   // MS
  '29': 10,  // MO
  '30': 4,   // MT
  '31': 5,   // NE (split; treating as bloc for now)
  '32': 6,   // NV
  '33': 4,   // NH
  '34': 14,  // NJ
  '35': 5,   // NM
  '36': 28,  // NY
  '37': 16,  // NC
  '38': 3,   // ND
  '39': 17,  // OH
  '40': 7,   // OK
  '41': 8,   // OR
  '42': 19,  // PA
  '44': 4,   // RI
  '45': 9,   // SC
  '46': 3,   // SD
  '47': 11,  // TN
  '48': 40,  // TX
  '49': 6,   // UT
  '50': 3,   // VT
  '51': 13,  // VA
  '53': 12,  // WA
  '54': 4,   // WV
  '55': 10,  // WI
  '56': 3    // WY
}
const TOTAL_EV = Object.values(EV_BY_FIPS).reduce((a, b) => a + b, 0) // 538

// Small helpers for formatting numbers and percentages
const fmtPct = (v: number | undefined | null, digits = 1) => {
  if (v == null || isNaN(v as any)) return '—'
  return `${(v as number).toFixed(digits)}%`
}
const fmtInt = (v: number | undefined | null) => {
  if (v == null || isNaN(v as any)) return '—'
  return Math.round(v as number).toLocaleString()
}
const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

// Build a rich tooltip for counties with leader rows and portraits
function buildCountyTooltipHTML(f: any, u?: CountyUpdateDto | null) {
  const name = f?.properties?.NAME || 'County'
  // Basic mapping for candidate portraits (use existing assets)
  const imgGop = '/electionanalytics/images/trump_portrait.jpg'
  // Use the newly added Harris portrait; fallback remains available
  const imgDem = '/electionanalytics/images/download.jpg'
  if (!u) {
    return `
      <div class="min-w-[220px]">
        <div class="text-slate-200 font-semibold mb-1">${name}</div>
        <div class="text-slate-400">No returns yet</div>
      </div>
    `
  }
  const total = Math.max(1, u.total || 0)
  const gPct = (u.gop / total) * 100
  const dPct = (u.dem / total) * 100
  const leadVotes = Math.abs(u.gop - u.dem)
  const leadPct = Math.abs(u.marginPct)
  const leaderName = u.leader === 'GOP' ? 'Trump' : (u.leader === 'DEM' ? 'Harris' : '—')
  const leaderColorClass = u.leader === 'GOP' ? 'text-red-300' : (u.leader === 'DEM' ? 'text-blue-300' : 'text-slate-300')
  const repPct = Math.max(0, Math.min(100, u.reportingPct || 0))

  return `
    <div class="min-w-[260px]">
      <div class="text-slate-200 font-semibold mb-1">${name}</div>
      <div class="flex items-center gap-2 ${leaderColorClass} text-[12px] mb-2">
        <span class="opacity-90">${leaderName !== '—' ? leaderName : 'No leader'}</span>
        ${leaderName !== '—' ? `<span class="text-slate-400">lead</span>` : ''}
        ${leaderName !== '—' ? `<span class="font-semibold">+${fmtInt(leadVotes)} (${leadPct.toFixed(1)}%)</span>` : ''}
      </div>
      <div class="space-y-1.5">
        <div class="flex items-center gap-2">
          <img src="${imgGop}" alt="GOP" class="w-6 h-6 rounded object-cover border border-slate-700" onerror="this.onerror=null;this.src='/electionanalytics/images/fallback_portrait.jpg';" />
          <div class="flex-1 flex items-center justify-between">
            <span class="text-slate-200">Trump (R)</span>
            <span class="text-slate-200 font-semibold">${gPct.toFixed(1)}% <span class="text-slate-400 font-normal">(${fmtInt(u.gop)})</span></span>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <img src="${imgDem}" alt="DEM" class="w-6 h-6 rounded object-cover border border-slate-700" onerror="this.onerror=null;this.src='/electionanalytics/images/fallback_portrait.jpg';" />
          <div class="flex-1 flex items-center justify-between">
            <span class="text-slate-200">Harris (D)</span>
            <span class="text-slate-200 font-semibold">${dPct.toFixed(1)}% <span class="text-slate-400 font-normal">(${fmtInt(u.dem)})</span></span>
          </div>
        </div>
      </div>
      <div class="mt-2 text-slate-400 text-[11px] flex items-center justify-between">
        <span>Est. vote in</span>
        <span class="text-slate-200">${repPct.toFixed(0)}%</span>
      </div>
    </div>
  `
}

// Build a rich tooltip for states using aggregated data
function buildStateTooltipHTML(f: any, agg?: StateAgg | null) {
  const name = f?.properties?.NAME || agg?.stateName || 'State'
  const imgGop = '/electionanalytics/images/trump_portrait.jpg'
  const imgDem = '/electionanalytics/images/download.jpg'
  if (!agg) {
    return `
      <div class="min-w-[220px]">
        <div class="text-slate-200 font-semibold mb-1">${name}</div>
        <div class="text-slate-400">No returns yet</div>
      </div>
    `
  }
  const total = Math.max(1, agg.totalReported || 0)
  const gPct = typeof agg.gopShare === 'number' ? (agg.gopShare * 100) : (agg.gop != null ? (agg.gop / total) * 100 : 0)
  const dPct = typeof agg.demShare === 'number' ? (agg.demShare * 100) : (agg.dem != null ? (agg.dem / total) * 100 : 0)
  const repPct = Math.max(0, Math.min(100, agg.reportingPct || 0))
  const leader = agg.marginPct > 0 ? 'GOP' : agg.marginPct < 0 ? 'DEM' : 'TIED'
  const leadVotes = Math.abs((agg.gop || 0) - (agg.dem || 0))
  const leadPct = Math.abs(agg.marginPct || 0)
  const leaderName = leader === 'GOP' ? 'Trump' : (leader === 'DEM' ? 'Harris' : '—')
  const leaderColorClass = leader === 'GOP' ? 'text-red-300' : (leader === 'DEM' ? 'text-blue-300' : 'text-slate-300')
  return `
    <div class="min-w-[260px]">
      <div class="text-slate-200 font-semibold mb-1">${name}</div>
      <div class="flex items-center gap-2 ${leaderColorClass} text-[12px] mb-2">
        <span class="opacity-90">${leaderName !== '—' ? leaderName : 'No leader'}</span>
        ${leaderName !== '—' ? `<span class="text-slate-400">lead</span>` : ''}
        ${leaderName !== '—' ? `<span class="font-semibold">+${fmtInt(leadVotes)} (${leadPct.toFixed(1)}%)</span>` : ''}
      </div>
      <div class="space-y-1.5">
        <div class="flex items-center gap-2">
          <img src="${imgGop}" alt="GOP" class="w-6 h-6 rounded object-cover border border-slate-700" onerror="this.onerror=null;this.src='/electionanalytics/images/fallback_portrait.jpg';" />
          <div class="flex-1 flex items-center justify-between">
            <span class="text-slate-200">Trump (R)</span>
            <span class="text-slate-200 font-semibold">${gPct.toFixed(1)}% <span class="text-slate-400 font-normal">(${fmtInt(agg.gop)})</span></span>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <img src="${imgDem}" alt="DEM" class="w-6 h-6 rounded object-cover border border-slate-700" onerror="this.onerror=null;this.src='/electionanalytics/images/fallback_portrait.jpg';" />
          <div class="flex-1 flex items-center justify-between">
            <span class="text-slate-200">Harris (D)</span>
            <span class="text-slate-200 font-semibold">${dPct.toFixed(1)}% <span class="text-slate-400 font-normal">(${fmtInt(agg.dem)})</span></span>
          </div>
        </div>
      </div>
      <div class="mt-2 text-slate-400 text-[11px] flex items-center justify-between">
        <span>Est. vote in</span>
        <span class="text-slate-200">${repPct.toFixed(0)}%</span>
      </div>
    </div>
  `
}

export default function USElectionDeckMapPage() {
  const [viewState, setViewState] = useState<ViewState>({ longitude: -96, latitude: 38.5, zoom: 3.5, pitch: 0, bearing: 0 })
  const [status, setStatus] = useState('Loading states…')
  const [hover, setHover] = useState<null | { x: number; y: number; html: string }>(null)
  const statesRef = useRef<FeatureCollection | null>(null)
  const countiesRef = useRef<FeatureCollection | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  // Debug: Track countyLive map size and keys on state selection
  useEffect(() => {
    const keys = Array.from(countyLive.current.keys())
    console.log(`[DEBUG] State selection changed: selected=${selected.join(',')}, countyLive size=${countyLive.current.size}, keys=[${keys.slice(0,10).join(',')}${keys.length>10?',...':''}]`)
  }, [selected])
  const [showStates, setShowStates] = useState<boolean>(true)
  const [connected, setConnected] = useState(false)
  const countyLive = useRef<Map<string, CountyUpdateDto>>(new Map())
  const [stateHeight, setStateHeight] = useState(1000)
  const [tickKey, setTickKey] = useState(0)
  const [updateCount, setUpdateCount] = useState(0)
  const [polling, setPolling] = useState(false)
  // Live state aggregates for coloring states and tooltips
  type StateAgg = {
    stateFips: string
    stateName?: string
    marginPct: number
    reportingPct?: number // 0-100
    gop?: number
    dem?: number
    totalReported?: number
    gopShare?: number // 0-1
    demShare?: number // 0-1
  }
  const stateLive = useRef<Map<string, StateAgg>>(new Map())
  const [stateTickKey, setStateTickKey] = useState(0)
  // SSE connection management
  const esRef = useRef<EventSource | null>(null)
  const reconnectRef = useRef<{ attempts: number; timer: any } | null>({ attempts: 0, timer: null })
  const lastTsRef = useRef<number>(0)
  const lastChecksumRef = useRef<string>("")

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const cacheBust = `?v=${Date.now()}`
        const s = await fetch(`/electionanalytics/gz_2010_us_040_00_500k.json${cacheBust}`).then(r => r.json())
        if (!alive) return
        statesRef.current = s as FeatureCollection
        setStatus('Loading counties…')
        try {
          const c = await fetch(`/electionanalytics/gz_2010_us_050_00_500k.json${cacheBust}`).then(r => r.json())
          if (!alive) return
          countiesRef.current = c as FeatureCollection
          setStatus('Ready')
        } catch {
          setStatus('States loaded (counties failed)')
        }
      } catch {
        setStatus('Failed to load states')
      }
    })()
    return () => {
      alive = false
    }
  }, [])




  const selectionKey = useMemo(() => selected.join(','), [selected])



  // Polling fallback when SSE is disconnected
  useEffect(() => {
    let timer: any = null
    if (!connected && selected.length > 0) {
      setPolling(true)
      const poll = async () => {
        try {
          let total = 0
          for (const sf of selected) {
            const url = `${BACKEND_BASE}/api/snapshot/counties?stateFips=${encodeURIComponent(sf)}`
            const res = await fetch(url)
            if (!res.ok) continue
            const data = await res.json()
            
            // Build baseline lookup if available
            const baselineMap = new Map<string, any>()
            if (data && Array.isArray((data as any).baselines)) {
              for (const b of (data as any).baselines) {
                const fips = String(b?.fips || '').slice(-5)
                if (fips) baselineMap.set(fips, b)
              }
            }
            
            const pushArr = (arr: any[], source: string) => {
              for (const raw of arr) {
                const existing = countyLive.current.get(String((raw?.fips ?? raw?.FIPS ?? raw?.geoid ?? raw?.countyFips) || '').slice(-5))
                const u = buildCountyUpdate(raw, baselineMap, existing)
                if (!u) continue
                countyLive.current.set(u.fips, u)
                total++
              }
            }
            if (Array.isArray(data)) pushArr(data as any[], 'direct-array')
            else if (data && Array.isArray((data as any).runtimes)) pushArr((data as any).runtimes, 'runtimes')
          }
          if (total > 0) {
            console.log(`Poll loaded ${total} counties for selected states`)
            setTickKey(k => k + 1)
            setUpdateCount(c => c + total)
          }
        } catch {
          // ignore
        }
      }
      // immediate first poll, then interval
      // Debug: Before poll, log countyLive size/keys
      const keysBefore = Array.from(countyLive.current.keys())
      console.log(`[DEBUG] Before poll: countyLive size=${countyLive.current.size}, keys=[${keysBefore.slice(0,10).join(',')}${keysBefore.length>10?',...':''}]`)
      poll()
      // Debug: After poll, log countyLive size/keys
      setTimeout(() => {
        const keysAfter = Array.from(countyLive.current.keys())
        console.log(`[DEBUG] After poll: countyLive size=${countyLive.current.size}, keys=[${keysAfter.slice(0,10).join(',')}${keysAfter.length>10?',...':''}]`)
      }, 500)
      timer = setInterval(poll, 2000)
    } else {
      setPolling(false)
    }
    return () => {
      if (timer) clearInterval(timer)
    }
  }, [connected, selectionKey])

  // Poll state aggregates when SSE is disconnected (keeps state colors and tooltips fresh)
  useEffect(() => {
    let timer: any = null
    if (!connected) {
      const pollAgg = async () => {
        try {
          const res = await fetch(`${BACKEND_BASE}/api/sim/state-aggregates`)
          if (!res.ok) return
          const data = await res.json()
          const list = Array.isArray(data)
            ? data
            : (Array.isArray((data as any)?.payload)
              ? (data as any).payload
              : (Array.isArray((data as any)?.value) ? (data as any).value : []))
          let added = 0
          for (const it of list as any[]) {
            const f = it?.stateFips ?? it?.state ?? it?.state_code
            const m = typeof it?.marginPct === 'number' ? it.marginPct : (typeof it?.margin === 'number' ? it.margin : null)
            const rep = typeof it?.reportingPct === 'number' ? it.reportingPct : (typeof it?.reporting_percentage === 'number' ? it.reporting_percentage : undefined)
            if (!f || m == null) continue
            const key = String(f).padStart(2, '0')
            const g = typeof it?.gop === 'number' ? it.gop : undefined
            const d = typeof it?.dem === 'number' ? it.dem : undefined
            const t = typeof it?.totalReported === 'number' ? it.totalReported : undefined
            const gs = typeof it?.gopShare === 'number' ? it.gopShare : undefined
            const ds = typeof it?.demShare === 'number' ? it.demShare : undefined
            const nm = typeof it?.stateName === 'string' ? it.stateName : undefined
            stateLive.current.set(key, { stateFips: key, stateName: nm, marginPct: m, reportingPct: rep, gop: g, dem: d, totalReported: t, gopShare: gs, demShare: ds })
            added++
          }
          if (added) setStateTickKey(k => k + 1)
        } catch {}
      }
      pollAgg()
      timer = setInterval(pollAgg, 2000)
    }
    return () => { if (timer) clearInterval(timer) }
  }, [connected])

  // Push active states to backend whenever selection changes (empty = all states active)
  useEffect(() => {
    try {
      fetch(`${BACKEND_BASE}/api/sim/active-states`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(selected)
      }).catch(() => {})
    } catch {}
  }, [selectionKey])

  // SSE connection to backend for live county updates and status with auto-reconnect and rehydrate
  useEffect(() => {
    const connect = () => {
      try {
        if (esRef.current) {
          try { esRef.current.close() } catch {}
        }
        const es = new EventSource(`${BACKEND_BASE}/api/stream/election-updates`)
        esRef.current = es
        es.onopen = () => {
          setConnected(true)
          if (reconnectRef.current) {
            reconnectRef.current.attempts = 0
            if (reconnectRef.current.timer) { clearTimeout(reconnectRef.current.timer); reconnectRef.current.timer = null }
          }
          // Rehydrate current selection and state aggregates
          ;(async () => {
            try {
              if (selected.length > 0) {
                for (const sf of selected) {
                  const res = await fetch(`${BACKEND_BASE}/api/snapshot/counties?stateFips=${encodeURIComponent(sf)}`)
                  if (!res.ok) continue
                  const data = await res.json()
                  // Build baseline map from payload for consistent fallback
                  const baselineMap = new Map<string, any>()
                  if (data && Array.isArray((data as any).baselines)) {
                    for (const b of (data as any).baselines) {
                      const bf = String(b?.fips || '').slice(-5)
                      if (bf) baselineMap.set(bf, b)
                    }
                  }
                  const pushArr = (arr: any[]) => {
                    for (const raw of arr) {
                      const existing = countyLive.current.get(String((raw?.fips ?? raw?.FIPS ?? raw?.geoid ?? raw?.countyFips) || '').slice(-5))
                      const u = buildCountyUpdate(raw, baselineMap, existing)
                      if (!u) continue
                      countyLive.current.set(u.fips, u)
                    }
                  }
                  if (Array.isArray(data)) pushArr(data as any[])
                  else {
                    if (data && Array.isArray((data as any).runtimes)) pushArr((data as any).runtimes)
                  }
                }
                setTickKey(k => k + 1)
              }
              try {
                const resAgg = await fetch(`${BACKEND_BASE}/api/sim/state-aggregates`)
                if (resAgg.ok) {
                  const dataAgg = await resAgg.json()
                  const list = Array.isArray(dataAgg)
                    ? dataAgg
                    : (Array.isArray((dataAgg as any)?.payload)
                      ? (dataAgg as any).payload
                      : (Array.isArray((dataAgg as any)?.value) ? (dataAgg as any).value : []))
                  for (const it of list as any[]) {
                    const f = it?.stateFips ?? it?.state ?? it?.state_code
                    const m = typeof it?.marginPct === 'number' ? it.marginPct : (typeof it?.margin === 'number' ? it.margin : null)
                    const rep = typeof it?.reportingPct === 'number' ? it.reportingPct : (typeof it?.reporting_percentage === 'number' ? it.reporting_percentage : undefined)
                    if (!f || m == null) continue
                    const key = String(f).padStart(2, '0')
                    const g = typeof it?.gop === 'number' ? it.gop : undefined
                    const d = typeof it?.dem === 'number' ? it.dem : undefined
                    const t = typeof it?.totalReported === 'number' ? it.totalReported : undefined
                    const gs = typeof it?.gopShare === 'number' ? it.gopShare : undefined
                    const ds = typeof it?.demShare === 'number' ? it.demShare : undefined
                    const nm = typeof it?.stateName === 'string' ? it.stateName : undefined
                    stateLive.current.set(key, { stateFips: key, stateName: nm, marginPct: m, reportingPct: rep, gop: g, dem: d, totalReported: t, gopShare: gs, demShare: ds })
                  }
                  setStateTickKey(k => k + 1)
                }
              } catch {}
            } catch {}
          })()
        }
        es.onerror = () => {
          setConnected(false)
          const base = 1000
          const max = 15000
          const attempts = (reconnectRef.current?.attempts ?? 0) + 1
          const backoff = Math.min(max, base * Math.pow(2, Math.min(6, attempts)))
          const jitter = Math.floor(Math.random() * 500)
          if (reconnectRef.current) reconnectRef.current.attempts = attempts
          const delay = backoff + jitter
          if (reconnectRef.current) {
            if (reconnectRef.current.timer) { clearTimeout(reconnectRef.current.timer) }
            reconnectRef.current.timer = setTimeout(() => connect(), delay)
          }
        }
        const normalize = (obj: any): CountyUpdateDto | null => {
          if (!obj) return null
          const fips = String((obj.fips ?? obj.FIPS ?? obj.geoid ?? obj.countyFips) || '').slice(-5)
            if (!fips) return null
          const existing = countyLive.current.get(fips)
          // SSE events don't include baselines; pass empty map. buildCountyUpdate still protects baseline regressions.
          const u = buildCountyUpdate(obj, new Map(), existing)
          if (!u) return null
          // Preserve any color/extrusion if supplied
          if (obj.color) (u as any).color = obj.color
          if (obj.extrusion != null) (u as any).extrusion = obj.extrusion
          return u
        }
        const eventNewer = (ts: number, payload: any): boolean => {
          const csum = typeof payload === 'string' ? payload.length.toString() : (Array.isArray(payload) ? String(payload.length) : Object.keys(payload || {}).join('|'))
          const newer = ts >= lastTsRef.current && csum !== lastChecksumRef.current
          if (newer) { lastTsRef.current = ts; lastChecksumRef.current = csum }
          return newer
        }
        const handleCountyArray = (arr: any[]) => {
          if (!arr || arr.length === 0) return
          let added = 0
          for (const raw of arr as any[]) {
            const u = normalize(raw)
            if (u && u.fips) {
              countyLive.current.set(u.fips, u)
              added++
            }
          }
          if (added > 0) {
            setTickKey(k => k + 1)
            setUpdateCount(c => c + added)
          }
        }
        const handleSingle = (obj: any) => {
          const u = normalize(obj)
          if (!u) return
          countyLive.current.set(u.fips, u)
          setTickKey(k => k + 1)
          setUpdateCount(c => c + 1)
        }
        // Default unnamed messages
        es.onmessage = (ev) => {
          try {
            const raw = ev.data || ''
            const lines = typeof raw === 'string' ? raw.split('\n').filter(Boolean) : []
            if (lines.length > 1) {
              for (const line of lines) {
                try {
                  const d = JSON.parse(line)
                  if (Array.isArray(d)) handleCountyArray(d)
                  else if (d && d.type === 'county-updates' && Array.isArray(d.payload)) handleCountyArray(d.payload)
                  else handleSingle(d)
                } catch {}
              }
              return
            }
            const data = JSON.parse(raw)
            if (Array.isArray(data)) handleCountyArray(data)
            else if (data && data.type === 'county-updates' && Array.isArray(data.payload)) handleCountyArray(data.payload)
            else if (data && Array.isArray((data as any).runtimes)) handleCountyArray((data as any).runtimes)
            else handleSingle(data)
          } catch {
            // ignore
          }
        }
        // Named SSE event: county-updates
        es.addEventListener('county-updates', (ev: MessageEvent) => {
          try {
            const data = JSON.parse((ev as any).data)
            const ts = (data && typeof (data as any).ts === 'number') ? (data as any).ts : Date.now()
            if (!eventNewer(ts, data)) return
            if (Array.isArray(data)) handleCountyArray(data)
            else if (data && Array.isArray((data as any).payload)) handleCountyArray((data as any).payload)
            else if (data && Array.isArray((data as any).runtimes)) handleCountyArray((data as any).runtimes)
          } catch {}
        })
        // Named SSE event: state-aggregates (color states)
        es.addEventListener('state-aggregates', (ev: MessageEvent) => {
          try {
            const data = JSON.parse((ev as any).data)
            const ts = (data && typeof (data as any).timestamp === 'number') ? (data as any).timestamp : Date.now()
            if (!eventNewer(ts, data)) return
            const list = Array.isArray(data)
              ? data
              : (Array.isArray((data as any)?.payload)
                ? (data as any).payload
                : (Array.isArray((data as any)?.value) ? (data as any).value : []))
            let added = 0
            for (const it of list as any[]) {
              const f = it?.stateFips ?? it?.state ?? it?.state_code
              const m = typeof it?.marginPct === 'number' ? it.marginPct : (typeof it?.margin === 'number' ? it.margin : null)
              const rep = typeof it?.reportingPct === 'number' ? it.reportingPct : (typeof it?.reporting_percentage === 'number' ? it?.reporting_percentage : undefined)
              if (!f || m == null) continue
              const key = String(f).padStart(2, '0')
              const g = typeof it?.gop === 'number' ? it.gop : undefined
              const d = typeof it?.dem === 'number' ? it.dem : undefined
              const t = typeof it?.totalReported === 'number' ? it.totalReported : undefined
              const gs = typeof it?.gopShare === 'number' ? it.gopShare : undefined
              const ds = typeof it?.demShare === 'number' ? it.demShare : undefined
              const nm = typeof it?.stateName === 'string' ? it.stateName : undefined
              stateLive.current.set(key, { stateFips: key, stateName: nm, marginPct: m, reportingPct: rep, gop: g, dem: d, totalReported: t, gopShare: gs, demShare: ds })
              added++
            }
            if (added) setStateTickKey(k => k + 1)
          } catch {}
        })
        // Heartbeat events
        es.addEventListener('heartbeat', () => {
          setConnected(true)
        })
      } catch {
        setConnected(false)
      }
    }
    connect()
    return () => {
      if (reconnectRef.current?.timer) clearTimeout(reconnectRef.current.timer)
      if (esRef.current) esRef.current.close()
    }
  }, [selectionKey])

  // Control helpers
  const requestSim = async (path: string, payload?: any) => {
    try {
      const res = await fetch(`${BACKEND_BASE}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload ? JSON.stringify(payload) : undefined
      })
      return await res.json().catch(() => ({}))
    } catch (e) {
      return {}
    }
  }

  const statesLayer = useMemo(() => {
    if (!statesRef.current || !showStates) return null
    const src = statesRef.current
    const features = (src.features || []).filter((f: any) => {
      const sf = to2(f?.properties?.STATE)
      return !(selected.length && sf && selected.includes(sf))
    }) as Feature<Geometry, any>[]
    const data = { type: 'FeatureCollection', features } as FeatureCollection
  // Easing for smoother transitions like the swingometer
  const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
  return new GeoJsonLayer<Feature<Geometry, any>>({
      id: 'states',
      data: data as any,
      pickable: true,
      stroked: true,
      filled: true,
      extruded: true,
      wireframe: false,
      getFillColor: (f: any) => {
        const sf = to2(f?.properties?.STATE)
        if (!sf) return [136, 136, 136, 220]
        const agg = stateLive.current.get(sf)
        if (!agg) return [136, 136, 136, 220]
        const leader = agg.marginPct > 0 ? 'GOP' : agg.marginPct < 0 ? 'DEM' : 'TIED'
        // Normalize to 0-100 if backend sends 0-1
        const repRaw = typeof agg.reportingPct === 'number' ? agg.reportingPct : 0
        const rep = repRaw > 1 ? repRaw : repRaw * 100
        return flMarginColor(leader as any, Math.abs(agg.marginPct), rep)
      },
      getLineColor: [255, 255, 255, 255],
      lineWidthMinPixels: 1.2,
  getElevation: stateHeight,
      transitions: {
        getElevation: { duration: 500, easing: easeInOutCubic },
        getFillColor: { duration: 800, easing: easeInOutCubic }
      },
      onHover: ({ x, y, object }: any) => {
        if (!object) return setHover(null)
        const sf = to2(object?.properties?.STATE)
        const agg = sf ? stateLive.current.get(sf) : undefined
        const html = buildStateTooltipHTML(object, agg)
        setHover({ x, y, html })
      },
      onClick: ({ object }: any) => {
        const sf = to2(object?.properties?.STATE)
        if (!sf) return
        setSelected(prev => (prev.includes(sf) ? prev.filter(s => s !== sf) : [...prev, sf]))
        // Removed aggressive camera change to avoid jerky movement
      },
      updateTriggers: {
        getElevation: `${selectionKey}|${stateHeight}`,
        getFillColor: `${selectionKey}|${stateTickKey}`
      }
    })
  }, [statesRef.current, selectionKey, stateTickKey, stateHeight, showStates])

  const selectedBordersLayer = useMemo(() => {
    if (!statesRef.current || selected.length === 0 || !showStates) return null
    const src = statesRef.current
    const features = (src.features || []).filter((f: any) => selected.includes(to2(f?.properties?.STATE) || '')) as Feature<Geometry, any>[]
    const data = { type: 'FeatureCollection', features } as FeatureCollection
  // Easing for smoother transitions
  const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
  return new GeoJsonLayer<Feature<Geometry, any>>({
      id: 'selected-state-borders',
      data: data as any,
      pickable: true,
      stroked: true,
      filled: false,
      extruded: false,
      getLineColor: [255, 255, 255, 255],
      lineWidthMinPixels: 1.2,
      onClick: ({ object }: any) => {
        const sf = to2(object?.properties?.STATE)
        if (!sf) return
        setSelected(prev => prev.filter(s => s !== sf))
      }
    })
  }, [statesRef.current, selectionKey, showStates])

  const countiesLayer = useMemo(() => {
    // Easing for smoother transitions like the swingometer
    const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
    if (!countiesRef.current) return null
    const src = countiesRef.current
    const features = (src.features || []).filter((f: any) => {
      if (!showStates) return true // show all counties when states are hidden
      const p = f?.properties || {}
      const code = to2(p.STATE ?? p.STATEFP ?? p.STATEFP10 ?? p.STATE_FIPS)
      return !!code && selected.includes(code)
    }) as Feature<Geometry, any>[]
    const data = { type: 'FeatureCollection', features: features.map((f: any) => ({ ...f })) } as FeatureCollection
    const defaultElevation = 6000
    return new GeoJsonLayer<Feature<Geometry, any>>({
      id: 'counties',
      data: data as any,
      pickable: true,
      stroked: true,
      filled: true,
      extruded: true,
      wireframe: false,
      getFillColor: (f: any) => {
        const fips = f?.properties?.GEO_ID?.slice(-5) || f?.properties?.FIPS || f?.properties?.COUNTYFP || ''
        const u = countyLive.current.get(fips)
        
        // Debug: Log first few counties to see what's happening
        if (Math.random() < 0.01) { // Log ~1% of counties
          console.log(`County ${fips}:`, u ? { 
            leader: u.leader, 
            marginPct: u.marginPct, 
            reportingPct: u.reportingPct,
            gop: u.gop, 
            dem: u.dem, 
            total: u.total 
          } : 'NO DATA')
        }
        
        if (u?.color) return hexToRgba(u.color, 230)
        if (u) {
          const rep = Math.max(0, Math.min(100, u.reportingPct || 0))
          return flMarginColor(u.leader, Math.abs(u.marginPct), rep)
        }
        return [136, 136, 136, 230]
      },
      getLineColor: [255, 255, 255, 255],
      lineWidthMinPixels: 1,
      getElevation: (f: any) => {
        const fips = f?.properties?.GEO_ID?.slice(-5) || f?.properties?.FIPS || f?.properties?.COUNTYFP || ''
        const u = countyLive.current.get(fips)
        if (u?.extrusion != null) return Math.max(0, u.extrusion)
        if (u?.reportingPct != null) return defaultElevation * (Math.max(0, Math.min(100, u.reportingPct)) / 100)
        return defaultElevation
      },
      parameters: ({
        depthTest: false,
        polygonOffsetUnits: 1,
        polygonOffsetFactor: 1
      } as any),
      transitions: {
        getElevation: { duration: 900, easing: easeInOutCubic, enter: () => 0 },
        getFillColor: { duration: 850, easing: easeInOutCubic }
      },
      onHover: ({ x, y, object }: any) => {
        if (!object) return setHover(null)
        const fips = object?.properties?.GEO_ID?.slice(-5) || object?.properties?.FIPS || object?.properties?.COUNTYFP || ''
        const u = fips ? countyLive.current.get(fips) : undefined
        const html = buildCountyTooltipHTML(object, u)
        setHover({ x, y, html })
      },
      updateTriggers: {
        getElevation: `${selectionKey}|${tickKey}|${showStates}`,
        getFillColor: `${selectionKey}|${tickKey}|${showStates}`
      }
    })
  }, [countiesRef.current, selectionKey, tickKey, showStates])

  const layers = useMemo(() => {
    const arr: any[] = []
    if (statesLayer) arr.push(statesLayer)
    if (countiesLayer) arr.push(countiesLayer)
    if (selectedBordersLayer) arr.push(selectedBordersLayer)
    return arr
  }, [statesLayer, countiesLayer, selectedBordersLayer])

  // Compute EV tally from current state leaders (simple winner-take-all)
  const evTally = useMemo(() => {
    let r = 0, d = 0, tied = 0
    try {
      for (const [sf, agg] of Array.from(stateLive.current.entries())) {
        const ev = EV_BY_FIPS[sf] ?? 0
        if (ev <= 0) continue
        if (typeof agg?.marginPct !== 'number') continue
        if (agg.marginPct > 0) r += ev
        else if (agg.marginPct < 0) d += ev
        else tied += ev
      }
    } catch {}
    const assigned = r + d // we treat exact ties as unassigned
    const remaining = Math.max(0, TOTAL_EV - assigned)
    return { r, d, remaining }
  }, [stateTickKey])

  return (
    <div className="w-screen h-screen fixed inset-0 bg-slate-950 text-slate-100">
      <div className="absolute top-3 left-3 z-30 flex gap-3 items-center">
        <button
          onClick={() => {
            setSelected([])
            setViewState(v => ({ ...v, pitch: 0 }))
          }}
          className="px-3 py-1.5 rounded-md text-xs font-medium bg-slate-900/80 border border-slate-700 hover:border-slate-600"
        >
          Back to States
        </button>
        <button
          onClick={() => setShowStates(s => !s)}
          className="px-3 py-1.5 rounded-md text-xs font-medium bg-slate-900/80 border border-slate-700 hover:border-slate-600"
        >
          {showStates ? 'Hide States (Counties only)' : 'Show States'}
        </button>
        <button
          onClick={() => setViewState(v => ({ ...v, zoom: 4, pitch: 20, bearing: 0 }))}
          className="px-3 py-1.5 rounded-md text-xs font-medium bg-slate-900/80 border border-slate-700 hover:border-slate-600"
        >
          Reset Camera
        </button>
        <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-slate-900/80 border border-slate-700">
          <label className="text-[11px] text-slate-300">State height</label>
          <input type="range" min={0} max={6000} step={100} value={stateHeight}
            onChange={e => setStateHeight(parseInt(e.target.value))}
            className="w-36" />
          <span className="text-[11px] text-slate-400">{stateHeight}</span>
        </div>
  <button onClick={() => requestSim('/api/sim/load')} className="px-3 py-1.5 rounded-md text-xs font-medium bg-slate-900/80 border border-slate-700 hover:border-slate-600">Load 2024</button>
        <button onClick={() => requestSim('/api/sim/start')} className="px-3 py-1.5 rounded-md text-xs font-medium bg-green-900/80 border border-green-700 hover:border-green-600">Start</button>
        <button onClick={() => requestSim('/api/sim/stop')} className="px-3 py-1.5 rounded-md text-xs font-medium bg-yellow-900/80 border border-yellow-700 hover:border-yellow-600">Stop</button>
        <button onClick={() => requestSim('/api/sim/reset')} className="px-3 py-1.5 rounded-md text-xs font-medium bg-red-900/80 border border-red-700 hover:border-red-600">Reset</button>
  <button onClick={() => requestSim('/api/sim/active-states', selected)} className="px-3 py-1.5 rounded-md text-xs font-medium bg-slate-900/80 border border-slate-700 hover:border-slate-600">Push Active</button>
        <span className="text-[11px] text-slate-300">{status}</span>
        <span className={"text-[11px] " + (connected? 'text-emerald-400':'text-rose-400')}>{connected? 'SSE: connected':'SSE: disconnected'}</span>
        <span className="text-[11px] text-slate-400">Updates: {updateCount}</span>
        {selected.length > 0 && !connected && (
          <span className="text-[11px] text-amber-400">Polling…</span>
        )}
        {countiesRef.current && selected.length > 0 && (
          <span className="text-[11px] text-slate-400">
            Counties:{' '}
            {(() => {
              try {
                const src = countiesRef.current as FeatureCollection
                const n = (src.features || []).filter((f: any) => {
                  const p = f?.properties || {}
                  const code = to2(p.STATE ?? p.STATEFP ?? p.STATEFP10 ?? p.STATE_FIPS)
                  return !!code && selected.includes(code)
                }).length
                return n
              } catch {
                return 0
              }
            })()}
          </span>
        )}
        {selected.length > 0 && <span className="text-[11px] text-slate-400">Selected: {selected.length}</span>}
        {selected.length > 0 && (
          <button onClick={() => setSelected([])} className="px-2 py-1 rounded-md text-[11px] font-medium bg-slate-900/80 border border-slate-700 hover:border-slate-600">
            Clear Selection
          </button>
        )}
      </div>
      {hover && (
        <div
          className="absolute z-30 pointer-events-none rounded-md border border-slate-700 bg-slate-900/90 px-2 py-1.5 text-[11px] shadow"
          style={{ left: hover.x + 10, top: hover.y + 10 }}
          dangerouslySetInnerHTML={{ __html: hover.html }}
        />
      )}
      <DeckGL
        layers={layers}
        viewState={viewState as any}
        controller={true}
        onViewStateChange={(v: any) => setViewState(v.viewState)}
        getCursor={({ isDragging }: any) => (isDragging ? 'grabbing' : 'default')}
        style={{ position: 'absolute', inset: '0' }}
      />
      {/* EV Counter Panel */}
      <div className="absolute top-3 right-3 z-30 w-72 p-3 rounded-md bg-slate-900/85 border border-slate-700 shadow">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[12px] tracking-wide text-slate-300 font-semibold">Electoral Votes</div>
          <div className="text-[11px] text-slate-400">270 to win</div>
        </div>
        <div className="flex items-baseline justify-between mb-1">
          <div className="flex items-baseline gap-1 text-rose-300">
            <span className="text-lg font-semibold">{evTally.r}</span>
            <span className="text-[11px]">R</span>
          </div>
          <div className="flex-1" />
          <div className="flex items-baseline gap-1 text-blue-300">
            <span className="text-lg font-semibold">{evTally.d}</span>
            <span className="text-[11px]">D</span>
          </div>
        </div>
        <div className="w-full h-2 rounded bg-slate-800 overflow-hidden mb-1" aria-label="EV progress">
          {(() => {
            const rPct = (evTally.r / TOTAL_EV) * 100
            const dPct = (evTally.d / TOTAL_EV) * 100
            return (
              <div className="w-full h-full relative">
                <div className="absolute left-0 top-0 h-full bg-red-600/80" style={{ width: `${rPct}%` }} />
                <div className="absolute right-0 top-0 h-full bg-blue-600/80" style={{ width: `${dPct}%` }} />
                <div className="absolute left-1/2 top-0 h-full w-px bg-slate-600/80" style={{ left: `${(270 / TOTAL_EV) * 100}%` }} />
              </div>
            )
          })()}
        </div>
        <div className="text-[11px] text-slate-400 flex items-center justify-between">
          <span>Remaining</span>
          <span className="text-slate-200">{evTally.remaining}</span>
        </div>
      </div>
    </div>
  )
}
