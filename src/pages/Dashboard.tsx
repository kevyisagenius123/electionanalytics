import { useState } from 'react'
import { Link } from 'react-router-dom'
import Map3D from '../components/Map3D'
import { ElectionBackendTest } from '../components/ElectionBackendTest'
import { useCountyElectionSimulation } from '../hooks/useCountyElectionSimulation'

// Import Heroicons
import {
  ChartBarIcon,
  GlobeAltIcon,
  CubeIcon,
  PlayIcon,
  PauseIcon,
  StopIcon,
  DocumentChartBarIcon,
  CogIcon,
  UserIcon,
  BellIcon,
  MagnifyingGlassIcon,
  ArrowPathIcon,
  EllipsisVerticalIcon,
  InformationCircleIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  CalendarIcon,
  MapIcon,
  ChartPieIcon,
  ArrowTrendingUpIcon,
  BuildingOfficeIcon,
  GlobeAmericasIcon,
  ComputerDesktopIcon,
  ServerIcon,
  SignalIcon,
  ClockIcon,
  ArrowTopRightOnSquareIcon
} from '@heroicons/react/24/outline'

const Dashboard = () => {
  const [year, setYear] = useState('2024')
  const [visualization, setVisualization] = useState('babylon-3d')
  const [showCloseRaces, setShowCloseRaces] = useState(false)
  const [colorMode, setColorMode] = useState('traditional')
  const [animationSpeed, setAnimationSpeed] = useState(1)
  const [showDistricts, setShowDistricts] = useState(false)
  const [currentMinute, setCurrentMinute] = useState(0)
  const [totalMinutes] = useState(1340)

  // Simulation hook
  const {
    counties: countySimData,
    isConnected: simulationConnected,
    error: simulationError,
    initializeSimulation,
    startSimulation,
    stopSimulation
  } = useCountyElectionSimulation()

  // Track simulation state manually since hook doesn't provide it
  const [isSimulating, setIsSimulating] = useState(false)

  const handleStartSimulation = async () => {
    try {
      setIsSimulating(true)
      await initializeSimulation()
      await startSimulation()
    } catch (error) {
      console.error('Failed to start simulation:', error)
      setIsSimulating(false)
    }
  }

  const handleStopSimulation = async () => {
    try {
      await stopSimulation()
      setIsSimulating(false)
    } catch (error) {
      console.error('Failed to stop simulation:', error)
    }
  }

  const renderVisualization = () => {
    switch (visualization) {
      case 'babylon-3d':
        return (
          <div className="flex items-center justify-center h-96 bg-slate-50 rounded-xl border-2 border-dashed border-slate-300">
            <div className="text-center">
              <DocumentChartBarIcon className="w-16 h-16 text-slate-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-slate-900 mb-2">3D Election Map</h3>
              <p className="text-slate-500 mb-4">Backend service temporarily unavailable</p>
              <p className="text-xs text-gray-400">Election simulation server not running on port 8083</p>
            </div>
          </div>
        )
      default:
        return (
          <div className="flex items-center justify-center h-96 bg-slate-50 rounded-xl border-2 border-dashed border-slate-300">
            <div className="text-center">
              <DocumentChartBarIcon className="w-16 h-16 text-slate-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-slate-900 mb-2">Select a Visualization</h3>
              <p className="text-slate-500">Choose from the options on the left to get started</p>
            </div>
          </div>
        )
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* Modern Header */}
      <header className="bg-white/95 backdrop-blur-sm border-b border-slate-200/60 shadow-sm sticky top-0 z-50">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center">
                  <GlobeAmericasIcon className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-slate-900">US Election Analytics</h1>
                  <p className="text-sm text-slate-500">Advanced Electoral Data Platform</p>
                </div>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2 px-3 py-2 bg-slate-100 rounded-lg">
                <ClockIcon className="w-4 h-4 text-slate-600" />
                <span className="text-sm text-slate-600">Last Updated: {new Date().toLocaleTimeString()}</span>
              </div>
              
              <button className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors">
                <BellIcon className="w-5 h-5" />
              </button>
              
              <button className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors">
                <CogIcon className="w-5 h-5" />
              </button>
              
              <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center">
                <UserIcon className="w-5 h-5 text-white" />
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Enhanced Left Sidebar */}
        <aside className="w-80 bg-white/80 backdrop-blur-sm border-r border-slate-200/60 shadow-lg h-screen sticky top-[73px] overflow-y-auto">
          <div className="p-6 space-y-6">
            {/* Navigation Section */}
            <div className="space-y-4">
              <div className="flex items-center space-x-2 mb-4">
                <MapIcon className="w-5 h-5 text-slate-600" />
                <h3 className="text-sm font-semibold text-slate-900">Navigation</h3>
              </div>
              
              <div className="grid grid-cols-1 gap-2">
                <Link
                  to="/pa-election"
                  className="flex items-center space-x-3 p-3 bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-lg hover:from-green-100 hover:to-emerald-100 transition-all group"
                >
                  <GlobeAmericasIcon className="w-5 h-5 text-green-600" />
                  <div className="flex-1">
                    <div className="text-sm font-medium text-slate-900">PA Election 2024</div>
                    <div className="text-xs text-slate-500">Ultra-realistic election simulation</div>
                  </div>
                  <ArrowTopRightOnSquareIcon className="w-4 h-4 text-green-600 opacity-60 group-hover:opacity-100" />
                </Link>

                <Link
                  to="/cesium-extruded"
                  className="flex items-center space-x-3 p-3 bg-gradient-to-r from-orange-50 to-red-50 border border-orange-200 rounded-lg hover:from-orange-100 hover:to-red-100 transition-all group"
                >
                  <CubeIcon className="w-5 h-5 text-orange-600" />
                  <div className="flex-1">
                    <div className="text-sm font-medium text-slate-900">3D Extruded Counties</div>
                    <div className="text-xs text-slate-500">Height-based demographics</div>
                  </div>
                  <ArrowTopRightOnSquareIcon className="w-4 h-4 text-orange-600 opacity-60 group-hover:opacity-100" />
                </Link>

                <Link
                  to="/cesium-3d"
                  className="flex items-center space-x-3 p-3 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg hover:from-blue-100 hover:to-indigo-100 transition-all group"
                >
                  <GlobeAltIcon className="w-5 h-5 text-blue-600" />
                  <div className="flex-1">
                    <div className="text-sm font-medium text-slate-900">Election Map 3D</div>
                    <div className="text-xs text-slate-500">Interactive globe view</div>
                  </div>
                  <ArrowTopRightOnSquareIcon className="w-4 h-4 text-blue-600 opacity-60 group-hover:opacity-100" />
                </Link>

                <Link
                  to="/demographics-3d"
                  className="flex items-center space-x-3 p-3 bg-gradient-to-r from-purple-50 to-violet-50 border border-purple-200 rounded-lg hover:from-purple-100 hover:to-violet-100 transition-all group"
                >
                  <ChartBarIcon className="w-5 h-5 text-purple-600" />
                  <div className="flex-1">
                    <div className="text-sm font-medium text-slate-900">Demographics 3D</div>
                    <div className="text-xs text-slate-500">Multi-dimensional analysis</div>
                  </div>
                  <ArrowTopRightOnSquareIcon className="w-4 h-4 text-purple-600 opacity-60 group-hover:opacity-100" />
                </Link>

                <Link
                  to="/echarts-3d"
                  className="flex items-center space-x-3 p-3 bg-gradient-to-r from-yellow-50 to-orange-50 border border-yellow-200 rounded-lg hover:from-yellow-100 hover:to-orange-100 transition-all group"
                >
                  <DocumentChartBarIcon className="w-5 h-5 text-yellow-600" />
                  <div className="flex-1">
                    <div className="text-sm font-medium text-slate-900">ECharts 3D</div>
                    <div className="text-xs text-slate-500">Advanced charts</div>
                  </div>
                  <ArrowTopRightOnSquareIcon className="w-4 h-4 text-yellow-600 opacity-60 group-hover:opacity-100" />
                </Link>
              </div>
            </div>

            {/* Dashboard Embedded View */}
            <div className="space-y-4">
              <div className="flex items-center space-x-2 mb-4">
                <ComputerDesktopIcon className="w-5 h-5 text-slate-600" />
                <h3 className="text-sm font-semibold text-slate-900">Dashboard View</h3>
              </div>
              
              <div className="space-y-2">
                {[
                  { id: 'babylon-3d', label: 'Babylon.js 3D', icon: CubeIcon, desc: 'Advanced 3D rendering' }
                ].map((viz) => (
                  <button
                    key={viz.id}
                    onClick={() => setVisualization(viz.id)}
                    className={`w-full flex items-start space-x-3 p-3 text-left rounded-lg border transition-all ${
                      visualization === viz.id
                        ? 'bg-blue-50 border-blue-200 text-blue-900'
                        : 'bg-white border-slate-200 text-slate-700 hover:border-blue-300 hover:bg-blue-50'
                    }`}
                  >
                    <viz.icon className={`w-5 h-5 mt-0.5 ${
                      visualization === viz.id ? 'text-blue-600' : 'text-slate-500'
                    }`} />
                    <div>
                      <div className="text-sm font-medium">{viz.label}</div>
                      <div className="text-xs text-slate-500 mt-1">{viz.desc}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Dataset Selection */}
            <div>
              <h3 className="text-sm font-semibold text-slate-900 mb-4 flex items-center space-x-2">
                <CalendarIcon className="w-4 h-4" />
                <span>Election Dataset</span>
              </h3>
              <div className="grid grid-cols-3 gap-2">
                {['2016', '2020', '2024'].map((y) => (
                  <button
                    key={y}
                    onClick={() => setYear(y)}
                    className={`px-3 py-2 text-sm font-medium rounded-lg border transition-all ${
                      year === y
                        ? 'bg-blue-600 text-white border-blue-600 shadow-md'
                        : 'bg-white text-slate-700 border-slate-200 hover:border-blue-300 hover:bg-blue-50'
                    }`}
                  >
                    {y}
                  </button>
                ))}
              </div>
            </div>

            {/* Display Options */}
            <div>
              <h3 className="text-sm font-semibold text-slate-900 mb-4 flex items-center space-x-2">
                <CogIcon className="w-4 h-4" />
                <span>Display Options</span>
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Color Mode</label>
                  <select
                    value={colorMode}
                    onChange={(e) => setColorMode(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="traditional">Traditional (Red/Blue)</option>
                    <option value="purple">Purple Scale</option>
                    <option value="margin">Margin Based</option>
                    <option value="turnout">Turnout Heat</option>
                  </select>
                </div>

                <div className="space-y-3">
                  <label className="flex items-center space-x-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showCloseRaces}
                      onChange={(e) => setShowCloseRaces(e.target.checked)}
                      className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                    />
                    <span className="text-sm text-slate-700">Highlight Close Races (±5%)</span>
                  </label>

                  <label className="flex items-center space-x-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showDistricts}
                      onChange={(e) => setShowDistricts(e.target.checked)}
                      className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                    />
                    <span className="text-sm text-slate-700">Show District Boundaries</span>
                  </label>
                </div>

                {visualization === 'babylon-3d' && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Animation Speed: {animationSpeed}x
                    </label>
                    <input
                      type="range"
                      min="0.1"
                      max="3"
                      step="0.1"
                      value={animationSpeed}
                      onChange={(e) => setAnimationSpeed(parseFloat(e.target.value))}
                      className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer slider"
                    />
                  </div>
                )}
              </div>
            </div>

          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-6 overflow-y-auto max-h-screen">
          <div className="max-w-7xl mx-auto space-y-6">
            {/* Analytics Panel */}
            <div className="bg-white/90 backdrop-blur-sm rounded-xl shadow-lg border border-slate-200/60 p-6">
              <div className="grid grid-cols-4 gap-6">
                <div className="text-center">
                  <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center mx-auto mb-3">
                    <BuildingOfficeIcon className="w-6 h-6 text-blue-600" />
                  </div>
                  <div className="text-2xl font-bold text-slate-900">3,143</div>
                  <div className="text-sm text-slate-500">Total Counties</div>
                </div>
                <div className="text-center">
                  <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center mx-auto mb-3">
                    <ChartPieIcon className="w-6 h-6 text-green-600" />
                  </div>
                  <div className="text-2xl font-bold text-slate-900">86.7%</div>
                  <div className="text-sm text-slate-500">Reporting</div>
                </div>
                <div className="text-center">
                  <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center mx-auto mb-3">
                    <ArrowTrendingUpIcon className="w-6 h-6 text-purple-600" />
                  </div>
                  <div className="text-2xl font-bold text-slate-900">67.2%</div>
                  <div className="text-sm text-slate-500">Turnout</div>
                </div>
                <div className="text-center">
                  <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center mx-auto mb-3">
                    <ComputerDesktopIcon className="w-6 h-6 text-orange-600" />
                  </div>
                  <div className="text-2xl font-bold text-slate-900">Live</div>
                  <div className="text-sm text-slate-500">Updates</div>
                </div>
              </div>
            </div>

            {/* Visualization Container */}
            <div className="bg-white/90 backdrop-blur-sm rounded-xl shadow-lg border border-slate-200/60 overflow-hidden">
              <div className="h-[600px]">
                {renderVisualization()}
              </div>
            </div>

            {/* Backend Connection Test */}
            <div className="bg-white/90 backdrop-blur-sm rounded-xl shadow-lg border border-slate-200/60 p-6">
              <div className="flex items-center space-x-3 mb-4">
                <ServerIcon className="w-6 h-6 text-slate-600" />
                <h3 className="text-lg font-semibold text-slate-900">Backend Connection</h3>
              </div>
              <ElectionBackendTest />
            </div>
          </div>
        </main>
      </div>

      {/* Enhanced Footer */}
      <footer className="bg-white/95 backdrop-blur-sm border-t border-slate-200/60 mt-8">
        <div className="px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-6 text-sm text-slate-600">
            <span>© 2024 US Election Analytics Platform</span>
            <span>•</span>
            <span>Data updated every 30 seconds</span>
            <span>•</span>
            <span>Built with Cesium, React & Spring Boot</span>
          </div>
          
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-green-400 rounded-full"></div>
              <span className="text-xs text-slate-600">System Operational</span>
            </div>
            <button className="text-xs text-slate-500 hover:text-slate-700 transition-colors">
              System Status
            </button>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default Dashboard
