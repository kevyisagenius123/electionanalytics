import React, { useMemo } from 'react'
import { ELECTORAL_VOTES, VOTES_TO_WIN, TOTAL_ELECTORAL_VOTES, STATE_NAMES, STATE_ABBREVIATIONS } from '../data/electoralVotes'

interface StateResult {
  fips: string
  name: string
  abbr: string
  ev: number
  margin: number // R-D percentage points
  winner: 'GOP' | 'DEM' | 'TIED'
  category: 'Safe R' | 'Lean R' | 'Toss-up' | 'Lean D' | 'Safe D'
}

interface ElectoralCollegeCalculatorProps {
  stateMargins: Map<string, number> // FIPS -> margin (R-D pp)
  showDetails?: boolean
  className?: string
}

const ElectoralCollegeCalculator: React.FC<ElectoralCollegeCalculatorProps> = ({
  stateMargins,
  showDetails = true,
  className = ''
}) => {
  
  const results = useMemo(() => {
    const stateResults: StateResult[] = []
    let gopEV = 0
    let demEV = 0
    let tiedEV = 0
    
    // Process each state
    Object.entries(ELECTORAL_VOTES).forEach(([fips, ev]) => {
      const margin = stateMargins.get(fips) || 0
      const absMargin = Math.abs(margin)
      
      let winner: 'GOP' | 'DEM' | 'TIED' = 'TIED'
      let category: StateResult['category'] = 'Toss-up'
      
      if (margin > 0.01) {
        winner = 'GOP'
        if (absMargin >= 10) category = 'Safe R'
        else if (absMargin >= 5) category = 'Lean R'
        else category = 'Toss-up'
        gopEV += ev
      } else if (margin < -0.01) {
        winner = 'DEM'
        if (absMargin >= 10) category = 'Safe D'
        else if (absMargin >= 5) category = 'Lean D'
        else category = 'Toss-up'
        demEV += ev
      } else {
        tiedEV += ev
      }
      
      stateResults.push({
        fips,
        name: STATE_NAMES[fips] || `State ${fips}`,
        abbr: STATE_ABBREVIATIONS[fips] || fips,
        ev,
        margin,
        winner,
        category
      })
    })
    
    // Sort by margin for tipping point analysis
    const sortedByMargin = [...stateResults].sort((a, b) => {
      // GOP states first (positive margin), largest to smallest
      // Then DEM states (negative margin), smallest to largest
      if (a.winner === 'GOP' && b.winner === 'GOP') return b.margin - a.margin
      if (a.winner === 'DEM' && b.winner === 'DEM') return a.margin - b.margin
      if (a.winner === 'GOP') return -1
      if (b.winner === 'GOP') return 1
      return 0
    })
    
    // Find tipping point state (the state that pushes winner over 270)
    let runningGOP = 0
    let runningDEM = 0
    let tippingPointFips: string | null = null
    
    for (const state of sortedByMargin) {
      if (state.winner === 'GOP') {
        runningGOP += state.ev
        if (runningGOP >= VOTES_TO_WIN && !tippingPointFips) {
          tippingPointFips = state.fips
        }
      } else if (state.winner === 'DEM') {
        runningDEM += state.ev
        if (runningDEM >= VOTES_TO_WIN && !tippingPointFips) {
          tippingPointFips = state.fips
        }
      }
    }
    
    // Categorize states
    const safeR = stateResults.filter(s => s.category === 'Safe R')
    const leanR = stateResults.filter(s => s.category === 'Lean R')
    const tossup = stateResults.filter(s => s.category === 'Toss-up')
    const leanD = stateResults.filter(s => s.category === 'Lean D')
    const safeD = stateResults.filter(s => s.category === 'Safe D')
    
    return {
      gopEV,
      demEV,
      tiedEV,
      allStates: stateResults,
      sortedByMargin,
      tippingPointFips,
      safeR,
      leanR,
      tossup,
      leanD,
      safeD
    }
  }, [stateMargins])
  
  const gopWins = results.gopEV >= VOTES_TO_WIN
  const demWins = results.demEV >= VOTES_TO_WIN
  const tied = !gopWins && !demWins
  
  const gopPercent = (results.gopEV / TOTAL_ELECTORAL_VOTES) * 100
  const demPercent = (results.demEV / TOTAL_ELECTORAL_VOTES) * 100
  
  return (
    <div className={`bg-slate-900/95 border border-slate-700 rounded-lg shadow-xl ${className}`}>
      {/* Header */}
      <div className="px-4 py-2 border-b border-slate-700">
        <div className="text-xs text-slate-400 font-semibold tracking-wide">RACE TO 270</div>
      </div>
      
      {/* Main Bar */}
      <div className="p-4">
        <div className="flex items-center gap-2">
          {/* Democrat Section */}
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-sm font-semibold text-blue-400">DEMOCRAT</div>
              <div className="text-3xl font-bold text-blue-300">{results.demEV}</div>
            </div>
          </div>
          
          {/* Progress Bar */}
          <div className="flex-1 relative h-8 bg-slate-800 rounded overflow-hidden">
            <div 
              className="absolute left-0 top-0 bottom-0 bg-blue-600 transition-all duration-500"
              style={{ width: `${demPercent}%` }}
            />
            <div 
              className="absolute right-0 top-0 bottom-0 bg-red-600 transition-all duration-500"
              style={{ width: `${gopPercent}%` }}
            />
            
            {/* 270 Marker */}
            <div 
              className="absolute top-0 bottom-0 w-0.5 bg-white z-10"
              style={{ left: `${(VOTES_TO_WIN / TOTAL_ELECTORAL_VOTES) * 100}%` }}
            >
              <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-[11px] font-bold text-white whitespace-nowrap">
                {VOTES_TO_WIN} TO WIN
              </div>
            </div>
          </div>
          
          {/* Republican Section */}
          <div className="flex items-center gap-3">
            <div className="text-left">
              <div className="text-sm font-semibold text-red-400">REPUBLICAN</div>
              <div className="text-3xl font-bold text-red-300">{results.gopEV}</div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Winner Banner */}
      {(demWins || gopWins) && (
        <div className={`px-4 py-2 border-t ${demWins ? 'bg-blue-900/30 border-blue-700' : 'bg-red-900/30 border-red-700'}`}>
          <div className={`text-center text-sm font-bold ${demWins ? 'text-blue-300' : 'text-red-300'}`}>
            {demWins ? 'DEMOCRAT' : 'REPUBLICAN'} WINS
          </div>
        </div>
      )}
      
      {results.tiedEV > 0 && (
        <div className="px-4 py-2 bg-slate-800/50 border-t border-slate-700 text-center">
          <span className="text-xs text-slate-400">Tossup: </span>
          <span className="text-sm font-bold text-slate-300">{results.tiedEV} EV</span>
        </div>
      )}
    </div>
  )
}

export default ElectoralCollegeCalculator
