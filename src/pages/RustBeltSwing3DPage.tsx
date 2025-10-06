import React, { useEffect, useMemo, useRef, useState } from 'react'
import DeckGL from '@deck.gl/react'
import { GeoJsonLayer } from '@deck.gl/layers'
import type { FeatureCollection, Feature, Geometry } from 'geojson'
import { iowaMarginRgba, extrusionFromMarginIOWA, turnoutHeightFromVotesIOWA, IOWA_GOP, IOWA_DEM, iowaMarginBinIndex } from '../lib/election/swing'

type ViewState = { longitude: number; latitude: number; zoom: number; pitch?: number; bearing?: number }
// Use dedicated Rust Belt backend (non-SSE). Default to relative path so Vite proxy handles dev.
const RB_API = (import.meta as any)?.env?.VITE_RB_API ?? '/api/rustbelt'
// Helper to get correct base URL for assets
const getAssetUrl = (path: string) => {
  const base = (import.meta as any)?.env?.BASE_URL || '/'
  return base + (path.startsWith('/') ? path.slice(1) : path)
}
// All scopes served by the Rust Belt backend; use states=ALL to request national baselines

// Rust Belt states (FIPS): IL(17), IN(18), MI(26), OH(39), PA(42), WI(55), MN(27)
const RUST_BELT_STATES = ['17','18','26','27','39','42','55']

type CountyBaseline = {
  fips: string
  stateFips: string
  countyName: string
  totalVotes2024: number
  votesGop2024: number
  votesDem2024: number
}

type CountyUpdateDto = {
  fips: string
  gop: number
  dem: number
  total: number
  reportingPct: number // 0-100
  marginPct: number // -100..100 (R-D)
  leader: 'GOP' | 'DEM' | 'TIED' | 'NONE'
  ts: number
}

function to2(v: any){ return v==null? null : String(v).padStart(2,'0') }

function clamp(v:number, lo:number, hi:number){ return Math.max(lo, Math.min(hi, v)) }

const NEUTRAL = '#64748B'

function hexToRgba(h: string, a=235): [number,number,number,number] {
  try {
    const s=h.replace('#',''); const n=parseInt(s.length===3? s.split('').map(c=>c+c).join(''):s,16)
    return [(n>>16)&255, (n>>8)&255, n&255, a]
  } catch { return [100,116,139,a] }
}

// Color by margin (R-D), matching Iowa 6-bin palettes
function iowaMarginColor(marginPct:number, alpha:number=235): [number,number,number,number] {
  if(!isFinite(marginPct)) return hexToRgba(NEUTRAL, alpha)
  return iowaMarginRgba(marginPct, alpha)
}

const RustBeltSwing3DPage: React.FC = () => {
  const [viewState, setViewState] = useState<ViewState>({ longitude: -86.5, latitude: 41.8, zoom: 4.3, pitch: 45, bearing: -10 })
  const statesRef = useRef<FeatureCollection | null>(null)
  const countiesRef = useRef<FeatureCollection | null>(null)
  // Keep unfiltered (national) geojson to allow scope switching without refetching
  const allStatesRef = useRef<FeatureCollection | null>(null)
  const allCountiesRef = useRef<FeatureCollection | null>(null)
  const [tickKey, setTickKey] = useState(0)
  const [status, setStatus] = useState('Loading…')
  // Scope selector: Rust Belt (default) or All States
  const [scope, setScope] = useState<'RB'|'ALL'>('RB')
  // Iowa-like scenario controls
  const [demSwing, setDemSwing] = useState(0)
  const [gopSwing, setGopSwing] = useState(0)
  const [turnoutShift, setTurnoutShift] = useState(0)
  const [linkSwings, setLinkSwings] = useState(false)
  const [netSwing, setNetSwing] = useState(0) // controls both party swings when linked: gop=+S/2, dem=−S/2 (margin R−D shifts by ~S)
  const [playing, setPlaying] = useState(false)
  const playTimer = useRef<any>(null)
  const [extrusionMode, setExtrusionMode] = useState<'margin'|'turnout'|'hybrid'>('hybrid')
  const [hybridWeight, setHybridWeight] = useState(60) // % margin in hybrid mix (0–100)
  const [heightScale, setHeightScale] = useState(1.0) // overall height scale multiplier
  const [showDiffHalo, setShowDiffHalo] = useState(false)
  const [fillAlpha, setFillAlpha] = useState(235)
  const [qualityMode, setQualityMode] = useState<'performance'|'balanced'|'quality'>(()=>{
    try { return (localStorage.getItem('rb_quality_mode') as any) || 'balanced' } catch { return 'balanced' }
  })
  const [verboseTooltip, setVerboseTooltip] = useState(true)
  const [stateHeightScale, setStateHeightScale] = useState(0.4)
  const legendRef = useRef<HTMLDivElement|null>(null)
  // Multi-year baselines and active base year
  // Include 2008 and 2012 per request. We will fall back to local JSON for these years
  // if the backend does not provide them.
  const availableYears = [2008, 2012, 2016, 2020, 2024]
  const [baseYear, setBaseYear] = useState<number>(2024)
  // Active baseline cache (depends on scope)
  const baselineByYearRef = useRef<Map<number, Map<string, CountyBaseline>>>(new Map())
  // Per-scope caches to avoid refetch on toggle
  const rbBaselineByYearRef = useRef<Map<number, Map<string, CountyBaseline>>>(new Map())
  const natBaselineByYearRef = useRef<Map<number, Map<string, CountyBaseline>>>(new Map())
  const turnoutStatsRef = useRef<{p95:number; max:number}>({p95:1, max:1})
  // Targeted Outcome Solver state
  const [solverTargetMargin, setSolverTargetMargin] = useState<string>("") // desired statewide margin (R−D, pp)
  const [solverMode, setSolverMode] = useState<'uniform'|'elastic'>('elastic')
  const [solverActive, setSolverActive] = useState(false)
  const solverLocalSwingsRef = useRef<Map<string,{dem:number; gop:number}>>(new Map())
  const [solverStatus, setSolverStatus] = useState<string>("")
  // State selection (mirror 2024 map: multi-select states)
  const [selectedStates, setSelectedStates] = useState<string[]>([])
  const selectionKey = useMemo(()=> selectedStates.join(','), [selectedStates])

  // Data stores
  const baseMap = useRef<Map<string, CountyBaseline>>(new Map())

  // Fallback loader for local 2008/2012 JSON (generated by build-2008-2016-json.js)
  async function loadFallbackYear(year: number): Promise<Map<string, CountyBaseline>> {
    const out = new Map<string, CountyBaseline>()
    try {
      const url = getAssetUrl(`data/results/counties_${year}.json`)
      const arr:any[] = await fetch(url).then(r=> r.ok? r.json(): [])
      if (Array.isArray(arr)) {
        for (const row of arr) {
          const fips = String(row?.FIPS || row?.fips || '').slice(-5)
          if (!fips || fips.length!==5) continue
          const t = Number(row?.total_votes || row?.total || 0)
          const g = Number(row?.votes_gop || row?.gop || 0)
          const d = Number(row?.votes_dem || row?.dem || 0)
          out.set(fips, {
            fips,
            stateFips: String(fips.slice(0,2)),
            countyName: String(row?.county || row?.name || 'County'),
            totalVotes2024: t,
            votesGop2024: g,
            votesDem2024: d,
          })
        }
      }
    } catch {}
    return out
  }

  // Load national geojson (store all; filter per scope)
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const s = await fetch(getAssetUrl('gz_2010_us_040_00_500k.json')).then(r=>r.json())
        if (!alive) return
        allStatesRef.current = s
        // Initialize current scoped states
        const sf = (s.features||[]).filter((f:any)=> RUST_BELT_STATES.includes(to2(f?.properties?.STATE) || ''))
        statesRef.current = { type:'FeatureCollection', features: sf }
        const c = await fetch(getAssetUrl('gz_2010_us_050_00_500k.json')).then(r=>r.json())
        if (!alive) return
        allCountiesRef.current = c
        const cf = (c.features||[]).filter((f:any)=> RUST_BELT_STATES.includes(to2(f?.properties?.STATE || f?.properties?.STATEFP || f?.properties?.STATEFP10) || ''))
        countiesRef.current = { type:'FeatureCollection', features: cf }
        setStatus('Ready')
      } catch {
        setStatus('Geo load failed')
      }
    })()
    return () => { alive = false }
  }, [])

  // Update current scoped geojson when scope changes
  useEffect(()=>{
    try{
      if (!allStatesRef.current || !allCountiesRef.current) return
      if (scope==='RB'){
        const sf = (allStatesRef.current.features||[]).filter((f:any)=> RUST_BELT_STATES.includes(to2(f?.properties?.STATE || f?.properties?.STATEFP || f?.properties?.STATEFP10) || ''))
        statesRef.current = { type:'FeatureCollection', features: sf }
        const cf = (allCountiesRef.current.features||[]).filter((f:any)=> RUST_BELT_STATES.includes(to2(f?.properties?.STATE || f?.properties?.STATEFP || f?.properties?.STATEFP10) || ''))
        countiesRef.current = { type:'FeatureCollection', features: cf }
        // Prune selection to RB only
        setSelectedStates(prev => prev.filter(s=> RUST_BELT_STATES.includes(s)))
      } else {
        // ALL: show all states; counties appear only when selected
        statesRef.current = allStatesRef.current
        countiesRef.current = allCountiesRef.current
      }
      setTickKey(k=>k+1)
    }catch{}
  }, [scope])

  // Load baselines (multi-year) from Rust Belt backend timeline, with local fallback for 2008/2012
  useEffect(() => {
    let stop = false
    ;(async () => {
      try {
        const url = `${RB_API}/timeline?years=${availableYears.join(',')}`
        const res = await fetch(url)
        if (res.ok) {
          const data = await res.json()
          const tmp = new Map<number, Map<string, CountyBaseline>>()
          for (const y of availableYears) {
            const arr:any[] = Array.isArray(data?.[String(y)]) ? data[String(y)] : []
            const m = new Map<string, CountyBaseline>()
            for (const b of arr) {
              const fips = String(b?.fips || '').slice(-5); if (!fips) continue
              m.set(fips, {
                fips,
                stateFips: String(b?.stateFips || fips.slice(0,2)),
                countyName: b?.countyName || 'County',
                totalVotes2024: Number(b?.totalVotes2024 || b?.total || 0),
                votesGop2024: Number(b?.votesGop2024 || b?.gop || 0),
                votesDem2024: Number(b?.votesDem2024 || b?.dem || 0)
              })
            }
            // If backend didn't provide a given year (common for 2008/2012),
            // attempt to fill using local JSON fallback.
            if (m.size===0 && (y===2008 || y===2012)) {
              const fb = await loadFallbackYear(y)
              if (fb.size) tmp.set(y, fb)
            } else if (m.size) {
              tmp.set(y, m)
            }
          }
          rbBaselineByYearRef.current = tmp
          // Default active cache is RB
          baselineByYearRef.current = rbBaselineByYearRef.current
          // Set current base map to selected year (default 2024)
          const cur = rbBaselineByYearRef.current.get(baseYear)
          if (cur) baseMap.current = cur
        }
      } catch {}
      finally { if (!stop) setTickKey(k=>k+1) }
    })()
    return () => { stop = true }
  }, [])

  // When scope toggles, swap active baselines; fetch "All States" from Rust Belt backend using states=ALL
  useEffect(()=>{
    let cancelled = false
    ;(async ()=>{
      if (scope==='RB'){
        baselineByYearRef.current = rbBaselineByYearRef.current
        const cur = baselineByYearRef.current.get(baseYear)
        if (cur) baseMap.current = cur
        setTickKey(k=>k+1)
      } else {
        // ALL
        if (natBaselineByYearRef.current.size===0){
          try{
            setStatus('Loading All States baselines…')
            const url = `${RB_API}/timeline?years=${availableYears.join(',')}&states=ALL`
            const res = await fetch(url)
            if (res.ok){
              const data = await res.json()
              const tmp = new Map<number, Map<string, CountyBaseline>>()
              for (const y of availableYears) {
                const arr:any[] = Array.isArray(data?.[String(y)]) ? data[String(y)] : []
                const m = new Map<string, CountyBaseline>()
                for (const b of arr) {
                  const fips = String(b?.fips || '').slice(-5); if (!fips) continue
                  m.set(fips, {
                    fips,
                    stateFips: String(b?.stateFips || fips.slice(0,2)),
                    countyName: b?.countyName || 'County',
                    totalVotes2024: Number(b?.totalVotes2024 || b?.total || 0),
                    votesGop2024: Number(b?.votesGop2024 || b?.gop || 0),
                    votesDem2024: Number(b?.votesDem2024 || b?.dem || 0)
                  })
                }
                // Fallback to local JSON for 2008/2012 if backend lacks them
                if (m.size===0 && (y===2008 || y===2012)) {
                  const fb = await loadFallbackYear(y)
                  if (fb.size) tmp.set(y, fb)
                } else if (m.size) {
                  tmp.set(y, m)
                }
              }
              natBaselineByYearRef.current = tmp
              if (!cancelled){ setStatus('Ready') }
            } else {
              if (!cancelled){ setStatus('National baselines unavailable'); }
            }
          } catch {
            if (!cancelled){ setStatus('National baselines load failed') }
          }
        }
        // Activate whichever we have (may be empty if load failed)
        baselineByYearRef.current = natBaselineByYearRef.current.size? natBaselineByYearRef.current : rbBaselineByYearRef.current
        const cur = baselineByYearRef.current.get(baseYear)
        if (cur) baseMap.current = cur
        setTickKey(k=>k+1)
      }
    })()
    return ()=>{ cancelled = true }
  }, [scope])

  // When baseYear changes, switch baseline map
  useEffect(()=>{
    const m = baselineByYearRef.current.get(baseYear)
    if (m) {
      baseMap.current = m
      setTickKey(k=>k+1)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseYear])
  // Clear solver when year changes (to avoid mixing weights across baselines)
  useEffect(()=>{ clearSolver(false) }, [baseYear])
  // Recompute turnout normalization stats when baseline changes
  useEffect(()=>{
    const totals:number[] = []
    baseMap.current.forEach(b=>{ const t = Number(b?.totalVotes2024||0); if (isFinite(t) && t>0) totals.push(t) })
    if (totals.length) {
      totals.sort((a,b)=>a-b)
      const max = totals[totals.length-1]
      const pos = (totals.length-1)*0.95
      const base = Math.floor(pos)
      const frac = pos - base
      const p95 = totals[base] + ((totals[Math.min(base+1, totals.length-1)]-totals[base])*(frac||0))
      turnoutStatsRef.current = { p95: Math.max(1, p95), max: Math.max(1, max) }
    } else {
      turnoutStatsRef.current = { p95: 1, max: 1 }
    }
  }, [tickKey, baseYear])
  // Pure client-side swingometer: no backend polling; update tick on slider changes
  useEffect(()=>{ setTickKey(k=>k+1) }, [demSwing, gopSwing, turnoutShift, linkSwings, netSwing, hybridWeight, heightScale, fillAlpha, stateHeightScale])

  // When linked, drive party swings from netSwing
  useEffect(()=>{
    if (linkSwings) {
      const g = clamp(netSwing/2, -30, 30)
      const d = clamp(-netSwing/2, -30, 30)
      setGopSwing(parseFloat(g.toFixed(2)) as any)
      setDemSwing(parseFloat(d.toFixed(2)) as any)
    }
  }, [linkSwings, netSwing])

  // Simple autoplay: oscillate swings when playing
  useEffect(()=>{
    if (playing) {
      if (playTimer.current) clearInterval(playTimer.current)
      playTimer.current = setInterval(()=>{
        setDemSwing(v=> Math.max(-30, Math.min(30, v + (Math.random()>0.5?1:-1))))
        setGopSwing(v=> Math.max(-30, Math.min(30, v + (Math.random()>0.5?1:-1))))
        setTurnoutShift(v=> Math.max(-30, Math.min(30, v + (Math.random()>0.5?1:-1))))
      }, 1200)
    } else {
      if (playTimer.current) { clearInterval(playTimer.current); playTimer.current = null }
    }
    return ()=> { if (playTimer.current) { clearInterval(playTimer.current); playTimer.current = null } }
  }, [playing])

  useEffect(()=>{ try { localStorage.setItem('rb_quality_mode', qualityMode) } catch {} }, [qualityMode])

  // Compute projected margin and swing from baseline + sliders using Iowa method:
  // Swings are additive to party shares then renormalized to keep (D+R) <= 1; third-party absorbs residual.
  function projectedSwing(base?: CountyBaseline, fips?:string): { swing:number; newMargin:number; baseMargin:number; baseShares?:{g:number; d:number}; newShares?:{g:number; d:number}; local?:{dem:number; gop:number} } {
    if (!base || base.totalVotes2024<=0) return { swing:0, newMargin:0, baseMargin:0 }
    const gShare0 = base.votesGop2024 / Math.max(1, base.totalVotes2024)
    const dShare0 = base.votesDem2024 / Math.max(1, base.totalVotes2024)
    const baseMargin = (gShare0 - dShare0) * 100
    // Additive swings (pp to shares) — include solver local swings if active
    let localDem = 0, localGop = 0
    if (solverActive && fips) {
      const loc = solverLocalSwingsRef.current.get(fips)
      if (loc) { localDem = loc.dem; localGop = loc.gop }
    }
    let dShare = dShare0 + (demSwing/100) + (localDem/100)
    let gShare = gShare0 + (gopSwing/100) + (localGop/100)
    // Clamp to [0,1]
    dShare = clamp(dShare, 0, 1)
    gShare = clamp(gShare, 0, 1)
    // Renormalize if D+R exceeds 1 (eliminate third-party first)
    const sumDG = dShare + gShare
    if (sumDG > 1) {
      const scale = 1 / sumDG
      dShare *= scale
      gShare *= scale
    }
    // Compute new margin
    const newMargin = (gShare - dShare) * 100
    const swing = newMargin - baseMargin
    return { swing, newMargin, baseMargin, baseShares:{ g:gShare0, d:dShare0 }, newShares:{ g:gShare, d:dShare }, local:{ dem: localDem, gop: localGop } }
  }

  const anySwing = (demSwing!==0 || gopSwing!==0 || solverActive)

  // Compute aggregated projected margin for a given state (R−D, pp), weighted by county votes
  function computeStateProjectedMargin(stateFips: string): number {
    const entries = Array.from(baseMap.current.values()).filter(b=> b.stateFips === stateFips)
    if (!entries.length) return 0
    let T = 0
    let sum = 0
    for (const b of entries) {
      const { newMargin, baseMargin } = projectedSwing(b, b.fips)
      const m = anySwing ? newMargin : baseMargin
      const t = Math.max(0, Number(b.totalVotes2024||0))
      T += t
      sum += (m/100) * t
    }
    return T>0 ? (sum/T)*100 : 0
  }

  function computeStateBaselineMargin(stateFips: string): number {
    const entries = Array.from(baseMap.current.values()).filter(b=> b.stateFips === stateFips)
    if (!entries.length) return 0
    let T = 0
    let sum = 0
    for (const b of entries) {
      const g0 = b.votesGop2024/Math.max(1,b.totalVotes2024)
      const d0 = b.votesDem2024/Math.max(1,b.totalVotes2024)
      const m = (g0 - d0) * 100
      const t = Math.max(0, Number(b.totalVotes2024||0))
      T += t
      sum += (m/100) * t
    }
    return T>0 ? (sum/T)*100 : 0
  }

  function countFlips(): { flips:number; total:number }{
    const entries = Array.from(baseMap.current.values())
    let flips=0, total=0
    for (const b of entries){
      const { baseMargin, newMargin } = projectedSwing(b, b.fips)
      // Consider a flip if margins have opposite signs and magnitudes are non-trivial
      if (Math.sign(baseMargin) !== Math.sign(newMargin) && Math.abs(baseMargin - newMargin) > 0.1) flips++
      total++
    }
    return { flips, total }
  }

  // Compute layers
  const countiesLayer = useMemo(() => {
    if (!countiesRef.current || selectedStates.length===0) return null
    const src = countiesRef.current
    const feats = (src.features||[]).filter((f:any)=>{
      const st = to2(f?.properties?.STATE || f?.properties?.STATEFP || f?.properties?.STATEFP10 || '')
      return !!st && selectedStates.includes(st)
    })
    const data = { type:'FeatureCollection', features: feats.map((f:any)=> ({...f})) } as FeatureCollection
    const perf = qualityMode === 'performance'
    const qual = qualityMode === 'quality'
    return new GeoJsonLayer<Feature<Geometry, any>>({
      id: 'rb-counties',
      data: data as any,
      pickable: true,
      stroked: true,
      filled: true,
      extruded: true,
      wireframe: false,
  parameters: ({ depthTest: false } as any),
      getFillColor: (f:any) => {
        const fips = f?.properties?.GEO_ID?.slice(-5) || f?.properties?.FIPS || f?.properties?.COUNTYFP || ''
        const base = baseMap.current.get(fips)
        if (!base) return [100,116,139,180]
        const { newMargin, baseMargin } = projectedSwing(base, fips)
        // Always color by margin (lead %), matching Iowa. When no swing, use baseline margin.
        const m = anySwing ? newMargin : baseMargin
        return iowaMarginColor(m, clamp(fillAlpha, 30, 255))
      },
      getElevation: (f:any) => {
        const fips = f?.properties?.GEO_ID?.slice(-5) || f?.properties?.FIPS || f?.properties?.COUNTYFP || ''
        const base = 1000
        const baseRec = baseMap.current.get(fips)
        if (!baseRec) return base
        const { newMargin, baseMargin } = projectedSwing(baseRec, fips)
        const marginForHeight = anySwing ? newMargin : baseMargin
        // Iowa margin extrusion function
        const marginHeight = extrusionFromMarginIOWA(marginForHeight)
        // Iowa turnout semantics: multiply baseline votes per county by factor; reflect via normalized height
        const tf = clamp(1 + (turnoutShift/100), 0.5, 1.5)
        const stats = turnoutStatsRef.current
        const turnoutHeight = turnoutHeightFromVotesIOWA(Number(baseRec.totalVotes2024||0), tf, stats.p95)
        let h = 0
        if (extrusionMode === 'margin') h = marginHeight
        else if (extrusionMode === 'turnout') h = turnoutHeight
        else {
          const w = clamp(hybridWeight, 0, 100)/100
          h = w*marginHeight + (1-w)*turnoutHeight
        }
        // Extra lift while in county view (selected states)
        const lift = 1.75
        return h * clamp(heightScale, 0.1, 3) * lift
      },
      getLineColor: (f:any) => {
        if (!showDiffHalo) return [255,255,255,200]
        const fips = f?.properties?.GEO_ID?.slice(-5) || f?.properties?.FIPS || f?.properties?.COUNTYFP || ''
        const base = baseMap.current.get(fips)
        if (!base) return [255,255,255,180]
        const { swing } = projectedSwing(base)
        if (!anySwing) return [255,255,255,180]
        const a = 120 + Math.round(Math.min(100, Math.abs(swing)*10))
        return swing>=0? [220,38,38,a] : [37,99,235,a]
      },
      lineWidthMinPixels: showDiffHalo ? (qual? 2.0 : 1.2) : 0.8,
      transitions: {
        getFillColor: { duration: perf? 0 : (qual? 800 : 600) },
        getElevation: { duration: perf? 0 : (qual? 1200 : 900), enter: () => 0 }
      },
      updateTriggers: {
        getFillColor: [tickKey, qualityMode, demSwing, gopSwing, baseYear, fillAlpha, selectionKey],
        getElevation: [tickKey, extrusionMode, qualityMode, turnoutShift, demSwing, gopSwing, baseYear, hybridWeight, heightScale, selectionKey],
        getLineColor: [tickKey, showDiffHalo, demSwing, gopSwing, baseYear, selectionKey]
      },
      onHover: ({ x,y,object }:any) => {
        if (!object) return
        const fips = object?.properties?.GEO_ID?.slice(-5) || object?.properties?.FIPS || object?.properties?.COUNTYFP || ''
        const base = baseMap.current.get(fips)
        const name = object?.properties?.NAME || 'County'
        const { swing, baseMargin, newMargin, baseShares, newShares, local } = projectedSwing(base, fips)
        const st = object?.properties?.STATE || object?.properties?.STATEFP || object?.properties?.STATEFP10
        const st2 = to2(st||'') || ''
        const stateProj = st2? computeStateProjectedMargin(st2) : null
        const tf = clamp(1 + (turnoutShift/100), 0.5, 1.5)
        const tip = document.getElementById('rb-tip')
        if (tip) {
          tip.style.display = 'block'
          tip.style.left = `${x+10}px`
          tip.style.top = `${y+10}px`
          if (verboseTooltip){
            const baseG = baseShares? (baseShares.g*100).toFixed(1) : '—'
            const baseD = baseShares? (baseShares.d*100).toFixed(1) : '—'
            const newG = newShares? (newShares.g*100).toFixed(1) : '—'
            const newD = newShares? (newShares.d*100).toFixed(1) : '—'
            const locDem = (local?.dem ?? 0).toFixed(2)
            const locGop = (local?.gop ?? 0).toFixed(2)
            tip.innerHTML = `<div style='font-weight:600'>${name}</div>
              <div style='font-size:11px;color:#cbd5e1'>Baseline: GOP ${baseG}%, DEM ${baseD}%, margin ${baseMargin.toFixed(2)} pp</div>
              <div style='font-size:11px;color:#cbd5e1'>Sliders: Dem ${demSwing.toFixed(2)} pp, GOP ${gopSwing.toFixed(2)} pp${solverActive? `, Local Δ: Dem ${locDem} pp, GOP ${locGop} pp` : ''}</div>
              <div style='font-size:11px;color:#cbd5e1'>Projected: GOP ${newG}%, DEM ${newD}%, margin ${anySwing? newMargin.toFixed(2)+' pp':'—'}</div>
              <div style='font-size:11px;color:#cbd5e1'>Turnout factor: ${(tf).toFixed(2)}× (shift ${turnoutShift}%)</div>
              ${stateProj!=null? `<div style='font-size:11px;color:#cbd5e1'>State projected margin: ${stateProj.toFixed(2)} pp</div>` : ''}`
          } else {
            tip.innerHTML = `<div style='font-weight:600'>${name}</div>
              <div style='font-size:11px;color:#cbd5e1'>Baseline: ${baseMargin.toFixed(2)} pp</div>
              <div style='font-size:11px;color:#cbd5e1'>Projected: ${anySwing? newMargin.toFixed(2)+' pp':'—'}</div>`
          }
        }
      },
      onClick: () => {}
    })
  }, [countiesRef.current, tickKey, selectionKey])

  const statesLayer = useMemo(() => {
    if (!statesRef.current) return null
    const src = statesRef.current
    const features = (src.features||[]).filter((f:any)=>{
      const st = to2(f?.properties?.STATE || f?.properties?.STATEFP || f?.properties?.STATEFP10 || '')
      return !(selectedStates.length>0 && st && selectedStates.includes(st))
    })
    const data = { type:'FeatureCollection', features } as FeatureCollection
    return new GeoJsonLayer<Feature<Geometry, any>>({
      id: 'rb-states',
      data: data as any,
      pickable: true,
      stroked: true,
      filled: true,
      extruded: true,
  // Enable depth testing so state extrusion height is visually apparent
  parameters: ({ depthTest: true } as any),
      getLineColor: [255,255,255,255],
      getFillColor: (f:any) => {
        const st = to2(f?.properties?.STATE || f?.properties?.STATEFP || f?.properties?.STATEFP10 || '')
        if (!st) return [0,0,0,0]
        const m = computeStateProjectedMargin(st)
        return iowaMarginColor(m, clamp(Math.min(fillAlpha, 220), 30, 255))
      },
      lineWidthMinPixels: qualityMode==='quality'? 1.6 : 1.0,
      getElevation: (f:any) => {
        const st = to2(f?.properties?.STATE || f?.properties?.STATEFP || f?.properties?.STATEFP10 || '')
        if (!st) return 0
        const m = computeStateProjectedMargin(st)
        const base = extrusionFromMarginIOWA(m)
        const hs = clamp(heightScale, 0.1, 3)
        const shs = clamp(stateHeightScale, 0.1, 5.0)
        return base * hs * shs * 0.6
      },
      transitions: {
        getElevation: { duration: qualityMode==='performance'? 0 : (qualityMode==='quality'? 1000 : 800), enter: () => 0 },
        getFillColor: { duration: qualityMode==='performance'? 0 : (qualityMode==='quality'? 800 : 600) }
      },
      onHover: ({x,y,object}:any) => {
        const tip = document.getElementById('rb-tip')
        if (!object) { if (tip) tip.style.display='none'; return }
        const name = object?.properties?.NAME || 'State'
        const st = to2(object?.properties?.STATE || object?.properties?.STATEFP || object?.properties?.STATEFP10 || '')
        const baseM = st? computeStateBaselineMargin(st) : 0
        const projM = st? computeStateProjectedMargin(st) : 0
        if (tip) {
          tip.style.display = 'block'
          tip.style.left = `${x+10}px`
          tip.style.top = `${y+10}px`
          tip.innerHTML = verboseTooltip
            ? `<div style='font-weight:600'>${name}</div>
               <div style='font-size:11px;color:#cbd5e1'>Baseline margin: ${baseM.toFixed(2)} pp (R−D)</div>
               <div style='font-size:11px;color:#cbd5e1'>Projected margin: ${projM.toFixed(2)} pp</div>`
            : `<div style='font-weight:600'>${name}</div>
               <div style='font-size:11px;color:#cbd5e1'>Projected: ${projM.toFixed(2)} pp</div>`
        }
      },
      onClick: ({object}:any) => {
        const st = to2(object?.properties?.STATE || object?.properties?.STATEFP || object?.properties?.STATEFP10 || '')
        if (!st) return
        setSelectedStates(prev => (prev.includes(st) ? prev.filter(s=>s!==st) : [...prev, st]))
        // Removed automatic camera changes to prevent jerky movement on selection
      },
      updateTriggers: {
        getFillColor: [tickKey, qualityMode, demSwing, gopSwing, baseYear, selectionKey, fillAlpha, scope],
        getElevation: [tickKey, qualityMode, demSwing, gopSwing, baseYear, selectionKey, heightScale, stateHeightScale, scope]
      }
    })
  }, [statesRef.current, qualityMode, tickKey, demSwing, gopSwing, baseYear, selectionKey, stateHeightScale, heightScale, scope])

  const selectedBordersLayer = useMemo(() => {
    if (!statesRef.current || selectedStates.length===0) return null
    const src = statesRef.current
    const features = (src.features||[]).filter((f:any)=>{
      const st = to2(f?.properties?.STATE || f?.properties?.STATEFP || f?.properties?.STATEFP10 || '')
      return !!st && selectedStates.includes(st)
    })
    const data = { type:'FeatureCollection', features } as FeatureCollection
    return new GeoJsonLayer<Feature<Geometry, any>>({
      id: 'rb-selected-borders',
      data: data as any,
      pickable: true,
      stroked: true,
      filled: false,
      extruded: false,
      getLineColor: [255,255,255,255],
      lineWidthMinPixels: qualityMode==='quality'? 1.6 : 1.0,
      onClick: ({object}:any) => {
        const st = to2(object?.properties?.STATE || object?.properties?.STATEFP || object?.properties?.STATEFP10 || '')
        if (!st) return
        setSelectedStates(prev => prev.filter(s=>s!==st))
      }
    })
  }, [statesRef.current, selectionKey, qualityMode])


  const layers = useMemo(() => {
    const arr:any[] = []
    if (countiesLayer) arr.push(countiesLayer)
    if (statesLayer) arr.push(statesLayer)
    if (selectedBordersLayer) arr.push(selectedBordersLayer)
    return arr
  }, [statesLayer, countiesLayer, selectedBordersLayer])

  // Solver helpers
  function computeCurrentStatewideMarginNoLocal(): number {
    const entries = Array.from(baseMap.current.values())
    if (!entries.length) return 0
    let T = 0
    let sum = 0
    for (const b of entries) {
      const { newMargin, baseMargin } = projectedSwing(b, undefined)
      const m = (demSwing!==0 || gopSwing!==0) ? newMargin : baseMargin
      const t = Math.max(0, Number(b.totalVotes2024||0))
      T += t
      sum += (m/100) * t
    }
    return T>0 ? (sum/T)*100 : 0
  }
  function runSolver(){
    try {
      const target = parseFloat(String(solverTargetMargin||'').trim())
      if (!isFinite(target)) { setSolverStatus('Enter a numeric target margin in pp (e.g., 1.5)'); return }
      const current = computeCurrentStatewideMarginNoLocal()
      const delta = target - current
      if (Math.abs(delta) < 0.05) { // within 0.05pp
        clearSolver(false)
        setSolverStatus(`Already within ${delta.toFixed(2)} pp of target; no solver applied.`)
        return
      }
      const entries = Array.from(baseMap.current.values())
      if (!entries.length) { setSolverStatus('No baseline data loaded'); return }
      const T = entries.reduce((acc,b)=> acc + Math.max(0, Number(b.totalVotes2024||0)), 0)
      if (T<=0) { setSolverStatus('Zero total votes baseline'); return }
      // Elasticity weights by county variability across years (abs margin changes)
      const yearMaps = baselineByYearRef.current
      const years = Array.from(yearMaps.keys()).sort()
      const eMap = new Map<string, number>()
      for (const b of entries) {
        const f = b.fips
        let margins:number[] = []
        for (const y of years) {
          const m = yearMaps.get(y)?.get(f)
          if (m && m.totalVotes2024>0) {
            const g0 = m.votesGop2024/Math.max(1,m.totalVotes2024)
            const d0 = m.votesDem2024/Math.max(1,m.totalVotes2024)
            margins.push((g0-d0)*100)
          }
        }
        let elast = 1
        if (margins.length>=2) {
          let sumAbs=0, cnt=0
          for (let i=1;i<margins.length;i++){ sumAbs += Math.abs(margins[i]-margins[i-1]); cnt++ }
          const avg = cnt? (sumAbs/cnt) : 0
          elast = Math.max(0.5, Math.min(3, 0.5 + avg/5)) // 0.5–3, more variable → higher
        }
        eMap.set(f, elast)
      }
      // Compute denominator depending on mode
      let denom = 0
      const wMap = new Map<string, number>()
      for (const b of entries) {
        const w = Math.max(0, Number(b.totalVotes2024||0))/T
        wMap.set(b.fips, w)
        denom += w * (solverMode==='elastic'? (eMap.get(b.fips)||1) : 1)
      }
      if (denom<=0) denom = 1
      const local = new Map<string,{dem:number; gop:number}>()
      let maxAbs=0
      for (const b of entries) {
        const w = wMap.get(b.fips)||0
        const e = (solverMode==='elastic'? (eMap.get(b.fips)||1) : 1)
        const dCounty = (delta * e) / denom // county margin change (pp)
        const g = dCounty/2
        const d = -dCounty/2
        maxAbs = Math.max(maxAbs, Math.abs(dCounty))
        local.set(b.fips, { dem:d, gop:g })
      }
      solverLocalSwingsRef.current = local
      setSolverActive(true)
      setSolverStatus(`${solverMode==='elastic'?'Elastic':'Uniform'} distribution: applied county swings to move statewide margin by ${delta.toFixed(2)} pp (max county Δ ${maxAbs.toFixed(2)} pp).`)
      setTickKey(k=>k+1)
    } catch (e:any) {
      setSolverStatus('Solver error: '+ (e?.message||String(e)))
    }
  }
  function clearSolver(refresh=true){
    solverLocalSwingsRef.current = new Map()
    setSolverActive(false)
    if (refresh) setTickKey(k=>k+1)
  }

  return (
    <div className="w-screen h-screen fixed inset-0 bg-slate-950 text-slate-100">
      <div className="absolute top-3 left-3 z-30 flex gap-3 items-center">
        <a href="/" className="px-3 py-1.5 rounded-md text-xs font-medium bg-slate-900/80 border border-slate-700 hover:border-slate-600">← Home</a>
        <span className="text-[11px] text-slate-300">{status}</span>
      </div>
      {/* Iowa-like scenario controls */}
      <div className="absolute top-14 left-3 z-30 flex flex-col gap-2 p-3 rounded-md bg-slate-900/80 border border-slate-700">
        <div className="flex items-center justify-between">
          <div className="text-[11px] text-slate-200 font-semibold">Scenario</div>
          {selectedStates.length>0 && (
            <button onClick={()=> setSelectedStates([])} className="px-2 py-1 text-[10px] rounded bg-slate-800/70 border border-slate-700">Clear state selection</button>
          )}
        </div>
        {/* Scope selector */}
        <div className="flex items-center gap-3">
          <label className="text-[11px] text-slate-300">Scope</label>
          <select value={scope} onChange={e=> setScope(e.target.value as any)} className="text-[11px] bg-slate-800 border border-slate-700 rounded px-2 py-1">
            <option value="RB">Rust Belt</option>
            <option value="ALL">All States</option>
          </select>
          {scope==='ALL' && natBaselineByYearRef.current.size===0 && (
            <span className="text-[10px] text-amber-300">Loading All States baselines…</span>
          )}
          {scope==='ALL' && natBaselineByYearRef.current.size===0 && status.toLowerCase().includes('unavailable') && (
            <span className="text-[10px] text-rose-300">Baselines unavailable; showing Rust Belt data</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-[11px] text-slate-300"><input type="checkbox" checked={verboseTooltip} onChange={e=> setVerboseTooltip(e.target.checked)} /> Verbose tooltip</label>
          <button onClick={()=>{
            try{
              if (!statesRef.current || selectedStates.length===0) return
              const sel = new Set(selectedStates)
              const feats = (statesRef.current.features||[]).filter((f:any)=> sel.has(to2(f?.properties?.STATE || f?.properties?.STATEFP || f?.properties?.STATEFP10 || '')||''))
              if (!feats.length) return
              // Compute simple bbox center and zoom hint
              const xs:number[] = [], ys:number[] = []
              for (const f of feats){
                const bb = (f as any).bbox as number[] | undefined
                if (bb && bb.length===4){ xs.push(bb[0],bb[2]); ys.push(bb[1],bb[3]) }
              }
              if (xs.length && ys.length){
                const minX = Math.min(...xs), maxX = Math.max(...xs)
                const minY = Math.min(...ys), maxY = Math.max(...ys)
                const cx = (minX+maxX)/2, cy=(minY+maxY)/2
                setViewState(v=> ({...v, longitude: cx, latitude: cy, zoom: Math.max(4.8, (v.zoom||0)+0.6), pitch: Math.max(35, v.pitch||0)}))
              }
            }catch{}
          }} className="px-2 py-1 text-[10px] rounded bg-slate-800/70 border border-slate-700">Fit to selection</button>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-[11px] text-slate-300 w-20">State height</label>
          <input type="range" min={0.1} max={5.0} step={0.05} value={stateHeightScale} onChange={e=> setStateHeightScale(parseFloat(e.target.value))} className="w-48"/>
          <div className="w-12 text-right text-[11px] text-slate-300">{stateHeightScale.toFixed(2)}×</div>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-[11px] text-slate-300 w-20">Base year</label>
          <select value={baseYear} onChange={e=> setBaseYear(parseInt(e.target.value))} className="text-[11px] bg-slate-800 border border-slate-700 rounded px-2 py-1">
            {availableYears.map(y=> <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        {/* Targeted Outcome Solver */}
        <div className="mt-1 p-2 rounded-md border border-slate-700 bg-slate-900/70">
          <div className="text-[11px] text-slate-200 font-semibold mb-1">Targeted Outcome</div>
          <div className="flex items-center gap-2 mb-1">
            <label className="text-[11px] text-slate-300 w-28">Target margin (pp)</label>
            <input value={solverTargetMargin} onChange={e=> setSolverTargetMargin(e.target.value)} placeholder="e.g. 1.5 or -0.8" className="text-[11px] bg-slate-800 border border-slate-700 rounded px-2 py-1 w-28" />
            <select value={solverMode} onChange={e=> setSolverMode(e.target.value as any)} className="text-[11px] bg-slate-800 border border-slate-700 rounded px-2 py-1">
              <option value="elastic">Elastic</option>
              <option value="uniform">Uniform</option>
            </select>
            <button onClick={runSolver} className="px-2 py-1 text-[11px] rounded bg-emerald-700 hover:bg-emerald-600 border border-emerald-600">Solve</button>
            {solverActive && <button onClick={()=>clearSolver(true)} className="px-2 py-1 text-[11px] rounded bg-slate-700 hover:bg-slate-600 border border-slate-600">Clear</button>}
          </div>
          {solverStatus && <div className="text-[10px] text-slate-400">{solverStatus}</div>}
        </div>
        {/* Linked swings and individual controls */}
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-[11px] text-slate-300"><input type="checkbox" checked={linkSwings} onChange={e=> setLinkSwings(e.target.checked)} /> Link swings</label>
          {linkSwings && (
            <>
              <label className="text-[11px] text-slate-300">Net swing</label>
              <input type="range" min={-60} max={60} value={netSwing} onChange={e=> setNetSwing(parseInt(e.target.value))} className="w-48"/>
              <div className="w-14 text-right text-[11px] text-slate-300">{netSwing} pp</div>
            </>
          )}
        </div>
        {!linkSwings && (
          <>
            <div className="flex items-center gap-2">
              <label className="text-[11px] text-slate-300 w-20">Dem swing</label>
              <input type="range" min={-30} max={30} value={demSwing} onChange={e=> setDemSwing(parseInt(e.target.value))} className="w-48"/>
              <div className="w-12 text-right text-[11px] text-slate-300">{demSwing} pp</div>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-[11px] text-slate-300 w-20">GOP swing</label>
              <input type="range" min={-30} max={30} value={gopSwing} onChange={e=> setGopSwing(parseInt(e.target.value))} className="w-48"/>
              <div className="w-12 text-right text-[11px] text-slate-300">{gopSwing} pp</div>
            </div>
          </>
        )}
        <div className="flex items-center gap-2">
          <label className="text-[11px] text-slate-300 w-20">Turnout</label>
          <input type="range" min={-30} max={30} value={turnoutShift} onChange={e=> setTurnoutShift(parseInt(e.target.value))} className="w-48"/>
          <div className="w-12 text-right text-[11px] text-slate-300">{turnoutShift}%</div>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-[11px] text-slate-300 w-20">Extrusion</label>
          <select value={extrusionMode} onChange={e=> setExtrusionMode(e.target.value as any)} className="text-[11px] bg-slate-800 border border-slate-700 rounded px-2 py-1">
            <option value="margin">Margin</option>
            <option value="turnout">Turnout</option>
            <option value="hybrid">Hybrid</option>
          </select>
        </div>
        {extrusionMode==='hybrid' && (
          <div className="flex items-center gap-2">
            <label className="text-[11px] text-slate-300 w-20">Hybrid mix</label>
            <input type="range" min={0} max={100} value={hybridWeight} onChange={e=> setHybridWeight(parseInt(e.target.value))} className="w-48"/>
            <div className="w-16 text-right text-[11px] text-slate-300">{hybridWeight}% margin</div>
          </div>
        )}
        <div className="flex items-center gap-2">
          <label className="text-[11px] text-slate-300 w-20">Height scale</label>
          <input type="range" min={0.1} max={3} step={0.1} value={heightScale} onChange={e=> setHeightScale(parseFloat(e.target.value))} className="w-48"/>
          <div className="w-10 text-right text-[11px] text-slate-300">{heightScale.toFixed(1)}×</div>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-[11px] text-slate-300 w-20">Fill opacity</label>
          <input type="range" min={64} max={255} step={1} value={fillAlpha} onChange={e=> setFillAlpha(parseInt(e.target.value))} className="w-48"/>
          <div className="w-10 text-right text-[11px] text-slate-300">{fillAlpha}</div>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-[11px] text-slate-300"><input type="checkbox" checked={showDiffHalo} onChange={e=> setShowDiffHalo(e.target.checked)} /> Diff halo</label>
          <label className="text-[11px] text-slate-300">Quality</label>
          <select value={qualityMode} onChange={e=> setQualityMode(e.target.value as any)} className="text-[11px] bg-slate-800 border border-slate-700 rounded px-2 py-1">
            <option value="performance">Performance</option>
            <option value="balanced">Balanced</option>
            <option value="quality">Quality</option>
          </select>
        </div>
        <div className="flex items-center gap-2 pt-1 flex-wrap">
          <button onClick={()=> setPlaying(p=>!p)} className={"px-3 py-1.5 rounded-md text-xs font-medium border "+(playing? 'bg-yellow-900/70 border-yellow-700':'bg-emerald-900/70 border-emerald-700')}>{playing? 'Pause':'Auto'}</button>
          <button onClick={()=>{ clearSolver(true); setLinkSwings(true); setNetSwing(-5); }} className="px-2 py-1.5 rounded-md text-xs font-medium bg-slate-800/70 border border-slate-700">Preset: D+5</button>
          <button onClick={()=>{ clearSolver(true); setLinkSwings(true); setNetSwing(5); }} className="px-2 py-1.5 rounded-md text-xs font-medium bg-slate-800/70 border border-slate-700">Preset: R+5</button>
          <button onClick={()=>{ setTurnoutShift(10); }} className="px-2 py-1.5 rounded-md text-xs font-medium bg-slate-800/70 border border-slate-700">High turnout +10%</button>
          <button onClick={()=>{ setTurnoutShift(-10); }} className="px-2 py-1.5 rounded-md text-xs font-medium bg-slate-800/70 border border-slate-700">Low turnout -10%</button>
          <button onClick={()=>{ setDemSwing(0); setGopSwing(0); setTurnoutShift(0); setLinkSwings(false); setNetSwing(0); setHybridWeight(60); setHeightScale(1); setFillAlpha(235); clearSolver(true); }} className="px-3 py-1.5 rounded-md text-xs font-medium bg-slate-800/70 border border-slate-700">Reset All</button>
        </div>

  {/* Statewide readout */}
  <StatewideReadout computeCurrentStatewideMarginNoLocal={computeCurrentStatewideMarginNoLocal} solverActive={solverActive} countFlips={countFlips} />
      </div>
      {/* Legend */}
  <div ref={legendRef} className="absolute bottom-4 left-4 z-30 bg-slate-900/85 border border-slate-700 rounded-lg p-3 text-[11px] text-slate-200" dangerouslySetInnerHTML={{ __html: legendHtml(anySwing) }} />
      <div id="rb-tip" className="absolute z-30 pointer-events-none rounded-md border border-slate-700 bg-slate-900/90 px-2 py-1.5 text-[11px] shadow" style={{ display:'none', left:0, top:0 }} />
      <DeckGL
        layers={layers}
        viewState={viewState as any}
        controller={true}
        onViewStateChange={(v:any)=> setViewState(v.viewState)}
        getCursor={({ isDragging }:any)=> (isDragging? 'grabbing' : 'default')}
        style={{ position:'absolute', inset:'0' }}
      />
    </div>
  )
}

export default RustBeltSwing3DPage

function legendHtml(anySwing=false){
  const stops = [-15,-10,-7,-4,-2,-1,0,1,2,4,7,10,15]
  const swatch = (v:number)=>{
    const idx = v===0? -1 : iowaMarginBinIndex(Math.abs(v))
    const col = v===0? NEUTRAL : (v>0? IOWA_GOP[idx] : IOWA_DEM[idx])
    return `<div style='display:flex;flex-direction:column;align-items:center;font-size:10px;color:#94a3b8;'>
      <div style='width:22px;height:12px;background:${col};border:1px solid #1e293b;border-radius:3px;'></div>
      <div>${v>0? '+'+v:v}</div>
    </div>`
  }
  return `<div style='display:flex;flex-direction:column;gap:6px;'>
    <div style='font-weight:600;font-size:12px;'>${anySwing? 'Margin with swing (R−D, pp)':'Baseline margin (R−D, pp)'}</div>
    <div style='display:flex;gap:6px;flex-wrap:wrap;max-width:340px;'>${stops.map(s=> swatch(s)).join('')}</div>
  </div>`
}

// Small inline component to show statewide baseline vs projected margins
const StatewideReadout: React.FC<{ computeCurrentStatewideMarginNoLocal: ()=>number; solverActive: boolean; countFlips?: ()=>{flips:number; total:number} }>=({ computeCurrentStatewideMarginNoLocal, solverActive, countFlips })=>{
  // We can't access baseMap here cleanly; do a simple recompute via provided function for projected,
  // and show baseline by temporarily zeroing swings would be intrusive. Instead, approximate baseline
  // by calling the function when swings are effectively zero (caller ensures correctness of label).
  const projected = computeCurrentStatewideMarginNoLocal()
  const flips = countFlips? countFlips() : null
  return (
    <div className="mt-2 p-2 rounded-md border border-slate-700 bg-slate-900/70">
      <div className="text-[11px] text-slate-200 font-semibold mb-1">Statewide margin</div>
      <div className="text-[11px] text-slate-300">Projected (incl. sliders{solverActive?', solver':''}): <span className={projected>=0? 'text-red-400':'text-blue-400'}>{projected.toFixed(2)} pp</span></div>
      {flips && <div className="text-[10px] text-slate-400">County flips: {flips.flips} / {flips.total}</div>}
      <div className="text-[10px] text-slate-500">Tip: Baseline is visible when swings are zero and solver is cleared.</div>
    </div>
  )
}
