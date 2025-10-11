import { useState, useEffect, useCallback, useRef } from 'react';
import { SimulationFrame } from '../types/simulation';

export interface County {
  fips: string;
  name: string;
  stateName: string;
  votesGop2024: number;
  votesDem2024: number;
  totalVotes2024: number;
  perGop2024: number;
  perDem2024: number;
  votesGop2020: number;
  votesDem2020: number;
  totalVotes2020: number;
  perGop2020: number;
  perDem2020: number;
  reportedVotesGop: number;
  reportedVotesDem: number;
  reportedTotal: number;
  reportingPercentage: number;
  isReported: boolean;
  lastUpdated: string | null;
  reportingProfile: string;
  expectedReportingOrder: number;
  populationDensity: number;
  timeZone: string;
}

export interface CongressionalDistrict {
  district: string;
  incumbent: string;
  party: string;
  harris2024: number;
  trump2024: number;
  margin2024: number;
  biden2020: number;
  trump2020: number;
  margin2020: number;
  reportedHarris: number;
  reportedTrump: number;
  reportedMargin: number;
  reportingPercentage: number;
  isReported: boolean;
  lastUpdated: string | null;
  reportingProfile: string;
  expectedReportingOrder: number;
}

export interface SimulationState {
  id: number;
  isActive: boolean;
  startTime: string;
  currentTime: string;
  timeZone: string;
  speedMultiplier: number;
  overallReportingPercentage: number;
  totalCountiesReported: number;
  totalCounties: number;
  totalDistrictsReported: number;
  totalDistricts: number;
  nationalVotesGop: number;
  nationalVotesDem: number;
  nationalTotalVotes: number;
  nationalPerGop: number;
  nationalPerDem: number;
  electoralVotesGop: number;
  electoralVotesDem: number;
  projectedWinner: string;
  projectedTime: string | null;
}

export interface NationalTotals {
  votesGop: number;
  votesDem: number;
  totalVotes: number;
  percentageGop: number;
  percentageDem: number;
  reportingPercentage: number;
  countiesReported: number;
  totalCounties: number;
  timestamp: number;
}

export interface ElectionAlert {
  message: string;
  type: 'milestone' | 'projection' | 'close-race' | 'info';
  timestamp: number;
}

const API_BASE_URL = import.meta.env.VITE_ELECTION_API || 'http://localhost:8083/api/v2';

export const useCountyElectionSimulation = () => {
  const [counties, setCounties] = useState<County[]>([]);
  const [districts, setDistricts] = useState<CongressionalDistrict[]>([]);
  const [simulationState, setSimulationState] = useState<SimulationState | null>(null);
  const [nationalTotals, setNationalTotals] = useState<NationalTotals | null>(null);
  const [alerts, setAlerts] = useState<ElectionAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [currentSimulationFrame, setCurrentSimulationFrame] = useState<SimulationFrame | null>(null);
  
  const eventSourceRef = useRef<EventSource | null>(null);

  // Initialize SSE connection
  const connectToStream = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    try {
      const eventSource = new EventSource(`${API_BASE_URL}/simulation/stream`);
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        console.log('Connected to election updates stream');
        setConnected(true);
        setError(null);
      };

      eventSource.onerror = (error) => {
        console.error('SSE connection error:', error);
        setConnected(false);
        setError('Connection to election updates failed');
      };

      // Handle simulation state updates
      eventSource.addEventListener('simulation-state', (event) => {
        try {
          const data = JSON.parse(event.data);
          setSimulationState(data);
        } catch (err) {
          console.error('Error parsing simulation state:', err);
        }
      });

      // Handle county updates
      eventSource.addEventListener('county-updates', (event) => {
        try {
          const updatedCounties: County[] = JSON.parse(event.data);
          setCounties(prevCounties => {
            const countyMap = new Map(prevCounties.map(c => [c.fips, c]));
            
            // Update existing counties with new data
            updatedCounties.forEach(updated => {
              countyMap.set(updated.fips, updated);
            });
            
            return Array.from(countyMap.values());
          });
        } catch (err) {
          console.error('Error parsing county updates:', err);
        }
      });

      // Handle district updates
      eventSource.addEventListener('district-updates', (event) => {
        try {
          const updatedDistricts: CongressionalDistrict[] = JSON.parse(event.data);
          setDistricts(prevDistricts => {
            const districtMap = new Map(prevDistricts.map(d => [d.district, d]));
            
            // Update existing districts with new data
            updatedDistricts.forEach(updated => {
              districtMap.set(updated.district, updated);
            });
            
            return Array.from(districtMap.values());
          });
        } catch (err) {
          console.error('Error parsing district updates:', err);
        }
      });

      // Handle national totals
      eventSource.addEventListener('national-totals', (event) => {
        try {
          const totals: NationalTotals = JSON.parse(event.data);
          setNationalTotals(totals);
        } catch (err) {
          console.error('Error parsing national totals:', err);
        }
      });

      // Handle alerts
      eventSource.addEventListener('alert', (event) => {
        try {
          const alert: ElectionAlert = JSON.parse(event.data);
          setAlerts(prev => [alert, ...prev].slice(0, 20)); // Keep latest 20 alerts
        } catch (err) {
          console.error('Error parsing alert:', err);
        }
      });

      // Handle simulation-frame events from realistic simulation
      eventSource.addEventListener('simulation-frame', (event) => {
        try {
          const frameData = JSON.parse(event.data);
          console.log('📊 Simulation frame #' + frameData.sequenceNumber);
          
          // Set the complete simulation frame
          setCurrentSimulationFrame(frameData);
          
          // Only update county data if we don't have it yet or it's significantly different
          if (frameData.counties && (!counties.length || frameData.sequenceNumber % 5 === 0)) {
            const countyArray = Object.entries(frameData.counties).map(([fips, countyData]) => ({
              fips,
              ...(countyData as any)
            }));
            setCounties(countyArray);
            console.log('📍 Updated counties:', countyArray.length);
          }
          
          // Update districts data if available (less frequently)
          if (frameData.districts && frameData.sequenceNumber % 10 === 0) {
            const districtArray = Object.entries(frameData.districts).map(([geoid, districtData]) => ({
              geoid,
              ...(districtData as any)
            }));
            setDistricts(districtArray);
            console.log('🏛️ Updated districts:', districtArray.length);
          }
          
          // Calculate national totals from state data (every frame)
          if (frameData.states) {
            let totalDem = 0;
            let totalRep = 0;
            let totalVotes = 0;
            
            Object.values(frameData.states).forEach((state: any) => {
              totalDem += state.demVotes || 0;
              totalRep += state.repVotes || 0;
              totalVotes += (state.demVotes || 0) + (state.repVotes || 0);
            });
            
            setNationalTotals({
              votesDem: totalDem,
              votesGop: totalRep,
              totalVotes: totalVotes,
              percentageDem: totalVotes > 0 ? (totalDem / totalVotes) * 100 : 0,
              percentageGop: totalVotes > 0 ? (totalRep / totalVotes) * 100 : 0,
              reportingPercentage: frameData.overallPercentReported * 100,
              countiesReported: frameData.counties ? Object.keys(frameData.counties).length : 0,
              totalCounties: frameData.counties ? Object.keys(frameData.counties).length : 0,
              timestamp: frameData.timestamp
            });
          }
        } catch (err) {
          console.error('Error parsing simulation frame:', err);
        }
      });

    } catch (err) {
      console.error('Failed to create EventSource:', err);
      setError('Failed to connect to election updates');
      setConnected(false);
    }
  }, []);

  // Load initial data
  const loadInitialData = useCallback(async () => {
    try {
      setLoading(true);
      
      // Initialize simulation first
      await fetch(`${API_BASE_URL}/simulation/initialize`, {
        method: 'POST'
      });

      // Load simulation status
      const statusResponse = await fetch(`${API_BASE_URL}/simulation/status`);
      if (statusResponse.ok) {
        const statusData = await statusResponse.json();
        setSimulationState(statusData);
      }

      console.log('✅ Election engine initialized successfully');
      setLoading(false);
    } catch (err) {
      console.error('Error loading initial data:', err);
      setError('Failed to load election data');
      setLoading(false);
    }
  }, []);

  // Simulation control functions
  const startSimulation = useCallback(async (speedMultiplier: number = 60) => {
    try {
      const response = await fetch(`${API_BASE_URL}/simulation/start?speedMultiplier=${speedMultiplier}`, {
        method: 'POST'
      });
      
      if (response.ok) {
        const result = await response.text(); // Backend returns plain text
        console.log('✅ Simulation started:', result);
        
        // Get the updated status
        const statusResponse = await fetch(`${API_BASE_URL}/simulation/status`);
        if (statusResponse.ok) {
          const simulation = await statusResponse.json();
          setSimulationState(simulation);
          return simulation;
        }
        return { message: result };
      } else {
        throw new Error('Failed to start simulation');
      }
    } catch (err) {
      console.error('Error starting simulation:', err);
      setError('Failed to start simulation');
      throw err;
    }
  }, []);

  const stopSimulation = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/simulation/stop`, {
        method: 'POST'
      });
      
      if (response.ok) {
        const result = await response.text(); // Backend returns plain text
        console.log('⏹️ Simulation stopped:', result);
        setSimulationState(null);
        return true;
      } else {
        throw new Error('Failed to stop simulation');
      }
    } catch (err) {
      console.error('Error stopping simulation:', err);
      setError('Failed to stop simulation');
      throw err;
    }
  }, []);

  const resetSimulation = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/simulation/reset`, {
        method: 'POST'
      });
      
      if (response.ok) {
        const result = await response.text(); // Backend returns plain text
        console.log('🔄 Simulation reset:', result);
        // Reload initial data after reset
        await loadInitialData();
        return true;
      } else {
        throw new Error('Failed to reset simulation');
      }
    } catch (err) {
      console.error('Error resetting simulation:', err);
      setError('Failed to reset simulation');
      throw err;
    }
  }, [loadInitialData]);

  // Get counties by state
  const getCountiesByState = useCallback((stateName: string) => {
    return counties.filter(county => 
      county.stateName.toLowerCase() === stateName.toLowerCase()
    );
  }, [counties]);

  // Get districts by state
  const getDistrictsByState = useCallback((state: string) => {
    return districts.filter(district => 
      district.district.startsWith(state.toUpperCase())
    );
  }, [districts]);

  // Get recently updated counties
  const getRecentlyUpdatedCounties = useCallback(() => {
    const oneMinuteAgo = Date.now() - 60000;
    return counties
      .filter(county => 
        county.lastUpdated && 
        new Date(county.lastUpdated).getTime() > oneMinuteAgo
      )
      .sort((a, b) => 
        new Date(b.lastUpdated!).getTime() - new Date(a.lastUpdated!).getTime()
      );
  }, [counties]);

  // Initialize on mount - but don't auto-connect to simulation
  useEffect(() => {
    // Do not auto-initialize or connect on mount to avoid unwanted network calls when backend is unavailable.
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  // Legacy interface for existing App.tsx compatibility
  const initializeSimulation = useCallback(async () => {
    await loadInitialData();
    return true;
  }, [loadInitialData]);

  return {
    // Data
    counties,
    districts,
    simulationState,
    nationalTotals,
    alerts,
    
    // State
    loading,
    error,
    connected,
    
    // Actions
    connectToStream, // Expose manual connection function
    startSimulation,
    stopSimulation,
    resetSimulation,
    loadInitialData,
    
    // Helpers
    getCountiesByState,
    getDistrictsByState,
    getRecentlyUpdatedCounties,
    
    // Computed values
    isSimulationActive: simulationState?.isActive || false,
    reportingPercentage: nationalTotals?.reportingPercentage || 0,
    totalVotes: nationalTotals?.totalVotes || 0,
    gopPercentage: nationalTotals?.percentageGop || 0,
    demPercentage: nationalTotals?.percentageDem || 0,
    
    // Legacy compatibility for existing App.tsx
    countySimData: counties.reduce((acc, county) => {
      acc[county.fips] = {
        fips: county.fips,
        name: county.name,
        state: county.stateName,
        reportingPercent: county.reportingPercentage,
        votesGop: county.reportedVotesGop,
        votesDem: county.reportedVotesDem,
        totalVotes: county.reportedTotal,
        lastUpdated: county.lastUpdated,
        isComplete: county.isReported
      };
      return acc;
    }, {} as Record<string, any>),
    isConnected: connected,
    initializeSimulation,
    currentSimulationFrame
  };
};
