import React from 'react';
import { useCountyElectionSimulation } from '../hooks/useCountyElectionSimulation';

export const ElectionBackendTest: React.FC = () => {
  const {
    counties,
    districts,
    simulationState,
    nationalTotals,
    alerts,
    loading,
    error,
    connected,
    startSimulation,
    stopSimulation,
    resetSimulation,
    isSimulationActive,
    reportingPercentage,
    gopPercentage,
    demPercentage
  } = useCountyElectionSimulation();

  const handleStartSimulation = async () => {
    try {
      await startSimulation(120); // 2x speed for testing
      console.log('Simulation started');
    } catch (err) {
      console.error('Failed to start simulation:', err);
    }
  };

  const handleStopSimulation = async () => {
    try {
      await stopSimulation();
      console.log('Simulation stopped');
    } catch (err) {
      console.error('Failed to stop simulation:', err);
    }
  };

  const handleResetSimulation = async () => {
    try {
      await resetSimulation();
      console.log('Simulation reset');
    } catch (err) {
      console.error('Failed to reset simulation:', err);
    }
  };

  if (loading) {
    return (
      <div className="p-6 bg-gray-100 rounded-lg">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-300 rounded w-1/4 mb-4"></div>
          <div className="h-4 bg-gray-300 rounded w-1/2 mb-2"></div>
          <div className="h-4 bg-gray-300 rounded w-3/4"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-red-100 border border-red-400 rounded-lg">
        <h3 className="text-red-800 font-semibold">Backend Connection Error</h3>
        <p className="text-red-700">{error}</p>
        <p className="text-sm text-red-600 mt-2">
          Make sure the Spring Boot backend is running on http://localhost:8081
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-2xl font-bold mb-4">Election Backend Status</h2>
        
        {/* Connection Status */}
        <div className="flex items-center gap-2 mb-4">
          <div className={`w-3 h-3 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`}></div>
          <span className={connected ? 'text-green-700' : 'text-red-700'}>
            {connected ? 'Connected to Live Stream' : 'Disconnected'}
          </span>
        </div>

        {/* Data Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-blue-50 p-4 rounded">
            <div className="text-2xl font-bold text-blue-700">{counties.length}</div>
            <div className="text-blue-600">Counties Loaded</div>
          </div>
          <div className="bg-purple-50 p-4 rounded">
            <div className="text-2xl font-bold text-purple-700">{districts.length}</div>
            <div className="text-purple-600">Districts Loaded</div>
          </div>
          <div className="bg-green-50 p-4 rounded">
            <div className="text-2xl font-bold text-green-700">{reportingPercentage.toFixed(1)}%</div>
            <div className="text-green-600">Reporting</div>
          </div>
          <div className="bg-orange-50 p-4 rounded">
            <div className="text-2xl font-bold text-orange-700">{alerts.length}</div>
            <div className="text-orange-600">Live Alerts</div>
          </div>
        </div>

        {/* Simulation Controls */}
        <div className="flex gap-3 mb-6">
          <button
            onClick={handleStartSimulation}
            disabled={isSimulationActive}
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-400"
          >
            {isSimulationActive ? 'Simulation Running...' : 'Start Simulation'}
          </button>
          <button
            onClick={handleStopSimulation}
            disabled={!isSimulationActive}
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:bg-gray-400"
          >
            Stop Simulation
          </button>
          <button
            onClick={handleResetSimulation}
            className="px-4 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700"
          >
            Reset Data
          </button>
        </div>

        {/* Live Results */}
        {nationalTotals && (
          <div className="bg-gray-50 p-4 rounded-lg mb-4">
            <h3 className="font-semibold mb-3">Live National Results</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-red-600 font-semibold">Republican: {gopPercentage.toFixed(1)}%</div>
                <div className="text-sm text-gray-600">{nationalTotals.votesGop.toLocaleString()} votes</div>
              </div>
              <div>
                <div className="text-blue-600 font-semibold">Democrat: {demPercentage.toFixed(1)}%</div>
                <div className="text-sm text-gray-600">{nationalTotals.votesDem.toLocaleString()} votes</div>
              </div>
            </div>
            <div className="mt-2 text-sm text-gray-500">
              Total Votes: {nationalTotals.totalVotes.toLocaleString()} • 
              Counties Reported: {nationalTotals.countiesReported}/{nationalTotals.totalCounties}
            </div>
          </div>
        )}

        {/* Recent Alerts */}
        {alerts.length > 0 && (
          <div className="bg-yellow-50 p-4 rounded-lg">
            <h3 className="font-semibold mb-3">Recent Election Alerts</h3>
            <div className="space-y-2 max-h-32 overflow-y-auto">
              {alerts.slice(0, 5).map((alert, index) => (
                <div key={index} className="text-sm">
                  <span className={`inline-block px-2 py-1 rounded text-xs mr-2 ${
                    alert.type === 'projection' ? 'bg-red-100 text-red-800' :
                    alert.type === 'milestone' ? 'bg-blue-100 text-blue-800' :
                    alert.type === 'close-race' ? 'bg-orange-100 text-orange-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {alert.type.toUpperCase()}
                  </span>
                  {alert.message}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Simulation State */}
        {simulationState && (
          <div className="bg-green-50 p-4 rounded-lg">
            <h3 className="font-semibold mb-2">Simulation Details</h3>
            <div className="text-sm space-y-1">
              <div>Speed: {simulationState.speedMultiplier}x</div>
              <div>Current Time: {new Date(simulationState.currentTime).toLocaleString()}</div>
              <div>Started: {new Date(simulationState.startTime).toLocaleString()}</div>
              <div>Projected Winner: {simulationState.projectedWinner}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
