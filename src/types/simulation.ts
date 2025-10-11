// DeckGL Simulation Types
export interface SimulationFrame {
  sequenceNumber: number;
  timestamp: number;
  overallPercentReported: number;
  counties?: Record<string, any>;
  states?: Record<string, any>;
  districts?: Record<string, any>;
}

export interface County {
  fips: string;
  name: string;
  stateName: string;
  votesGop2024: number;
  votesDem2024: number;
  totalVotes2024: number;
  perGop2024: number;
  perDem2024: number;
  reportedVotesGop: number;
  reportedVotesDem: number;
  reportedTotal: number;
  reportingPercentage: number;
  isReported: boolean;
  lastUpdated: string | null;
}

export interface MonteCarloUpdate {
  minute: number;
  stateResults: Array<{
    stateFips: string;
    stateName: string;
    trumpVotes: number;
    harrisVotes: number;
    totalVotes: number;
    trumpPercentage: number;
    harrisPercentage: number;
    reportingPercentage: number;
    color: string;
    isReporting: boolean;
  }>;
  countyResults: Array<{
    countyFips: string;
    countyName: string;
    stateName: string;
    trumpVotes: number;
    harrisVotes: number;
    totalVotes: number;
    trumpPercentage: number;
    harrisPercentage: number;
    reportingPercentage: number;
    color: string;
    isReporting: boolean;
  }>;
}
