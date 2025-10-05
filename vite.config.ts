import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// Simple development-time mock API to satisfy frontend expectations without a separate backend
function devMockApi(): Plugin {
  return {
    name: 'dev-mock-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url || ''

        // Server-Sent Events endpoints for election updates (new and legacy)
        if (url.startsWith('/api/stream/updates') || url.startsWith('/api/stream/election-updates') || url.startsWith('/api/stream/election-results')) {
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
          })

          // Send an initial ping and some minimal frames periodically
          const sendFrame = () => {
            const nowIso = new Date().toISOString()
            const simulationState = {
              id: 1,
              isActive: false,
              startTime: nowIso,
              currentTime: nowIso,
              timeZone: 'UTC',
              speedMultiplier: 1,
              overallReportingPercentage: 0,
              totalCountiesReported: 0,
              totalCounties: 0,
              totalDistrictsReported: 0,
              totalDistricts: 0,
              nationalVotesGop: 0,
              nationalVotesDem: 0,
              nationalTotalVotes: 0,
              nationalPerGop: 0,
              nationalPerDem: 0,
              electoralVotesGop: 0,
              electoralVotesDem: 0,
              projectedWinner: '',
              projectedTime: null,
            }
            const nationalTotals = {
              votesGop: 0,
              votesDem: 0,
              totalVotes: 0,
              percentageGop: 0,
              percentageDem: 0,
              reportingPercentage: 0,
              countiesReported: 0,
              totalCounties: 0,
              timestamp: Date.now(),
            }

            res.write(`event: simulation-state\n`)
            res.write(`data: ${JSON.stringify(simulationState)}\n\n`)

            res.write(`event: national-totals\n`)
            res.write(`data: ${JSON.stringify(nationalTotals)}\n\n`)

            // Keep-alive comment
            res.write(`: keep-alive ${Date.now()}\n\n`)
          }

          const interval = setInterval(sendFrame, 15000)
          // send immediately
          sendFrame()

          req.on('close', () => {
            clearInterval(interval)
          })
          return
        }

        // JSON helpers
        const sendJson = (data: unknown) => {
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(data))
        }

        // Data endpoints
        if (url === '/api/election/health') {
          return sendJson({ status: 'ok', time: new Date().toISOString() })
        }
        if (url === '/api/election/counties') {
          // Minimal empty payload satisfies the frontend without errors
          return sendJson([])
        }
        if (url === '/api/election/districts') {
          return sendJson([])
        }
        if (url === '/api/election/simulation/status') {
          const nowIso = new Date().toISOString()
          return sendJson({
            id: 1,
            isActive: false,
            startTime: nowIso,
            currentTime: nowIso,
            timeZone: 'UTC',
            speedMultiplier: 1,
            overallReportingPercentage: 0,
            totalCountiesReported: 0,
            totalCounties: 0,
            totalDistrictsReported: 0,
            totalDistricts: 0,
            nationalVotesGop: 0,
            nationalVotesDem: 0,
            nationalTotalVotes: 0,
            nationalPerGop: 0,
            nationalPerDem: 0,
            electoralVotesGop: 0,
            electoralVotesDem: 0,
            projectedWinner: '',
            projectedTime: null,
          })
        }
        if (url === '/api/election/national-totals') {
          return sendJson({
            votesGop: 0,
            votesDem: 0,
            totalVotes: 0,
            percentageGop: 0,
            percentageDem: 0,
            reportingPercentage: 0,
            countiesReported: 0,
            totalCounties: 0,
            timestamp: Date.now(),
          })
        }
        // Provide county GeoJSON during dev (fallback if backend not running)
        if (url === '/api/timeline/geo/counties') {
          try {
            const fs = require('fs');
            const path = require('path');
            // Prefer file inside project root if present
            const rootFile = path.resolve(__dirname, '../gz_2010_us_050_00_500k.json');
            let data;
            if (fs.existsSync(rootFile)) {
              data = fs.readFileSync(rootFile, 'utf-8');
            } else {
              // also try static copy under public if available
              const publicFile = path.resolve(__dirname, './public/geo/gz_2010_us_050_00_500k.json');
              data = fs.readFileSync(publicFile, 'utf-8');
            }
            res.setHeader('Content-Type', 'application/json');
            res.end(data);
            return;
          } catch (e) {
            res.statusCode = 404;
            return res.end(JSON.stringify({ error: 'county geojson not found in dev' }));
          }
        }

        // Stream control and status endpoints for legacy hook
        if (url === '/api/stream/health') {
          return sendJson({ status: 'ok', time: new Date().toISOString() })
        }
        if (url === '/api/stream/status') {
          return sendJson({ running: false, connectedClients: 1, lastUpdate: new Date().toISOString() })
        }
        if (url === '/api/stream/start-simulation') {
          return sendJson({ started: true, at: new Date().toISOString() })
        }
        if (url === '/api/stream/stop-simulation') {
          return sendJson({ stopped: true, at: new Date().toISOString() })
        }

        // TX backend dev mocks to avoid 500 spam when backend is offline
        if (url === '/api/tx/health') {
          return sendJson({ status: 'ok', service: 'tx-mock', time: new Date().toISOString() })
        }
        if (url === '/api/tx/simulation/status') {
          return sendJson({ running: false, isRunning: false, phase: 'idle', overallPercentReported: 0 })
        }
        if (url === '/api/tx/simulation/start' && req.method === 'POST') {
          return sendJson({ started: true })
        }
        if (url === '/api/tx/simulation/stop' && req.method === 'POST') {
          return sendJson({ stopped: true })
        }
        if (url === '/api/tx/simulation/current') {
          // Minimal empty frame keeps UI responsive without errors
          return sendJson({ sequence: 0, overallPercentReported: 0, phase: 'idle', phaseDescription: 'mock', counties: [] })
        }

        // Iowa scenario mock only when explicitly enabled (set MOCK_IOWA=1)
        if (process.env.MOCK_IOWA === '1') {
          if (url === '/api/iowa-scenario/baseline') {
            try {
              const fs = require('fs');
              const path = require('path');
              const geoFile = path.resolve(__dirname, '../public/gz_2010_us_050_00_500k.json');
              let baseline:any[] = [];
              if (fs.existsSync(geoFile)) {
                const raw = JSON.parse(fs.readFileSync(geoFile,'utf-8'));
                baseline = (raw.features||[])
                  .filter((f:any)=> String(f.properties.STATE||f.properties.STATEFP||'').padStart(2,'0')==='19')
                  .map((f:any)=>{ const gid = String(f.properties.GEO_ID||'').match(/(\d{5})$/)?.[1]||''; return { fips: gid, countyName: f.properties.NAME, demShare:0.48, gopShare:0.52, demVotes:4800, gopVotes:5200, totalVotes:10000, marginPct:(0.52-0.48)*100 }; });
              }
              return sendJson(baseline);
            } catch(e){ return sendJson([]); }
          }
          if (url === '/api/iowa-scenario/compute' && req.method==='POST') {
            // Simple echo baseline-style placeholder
            return sendJson([]);
          }
        }

        return next()
      })
    },
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  base: process.env.NODE_ENV === 'production' ? '/electionanalytics/' : '/',
  plugins: [react(), devMockApi()],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
  'urijs': 'urijs/src/URI.js',
  'grapheme-splitter': resolve(__dirname, './src/shims/grapheme-splitter-default.mjs'),
  'bitmap-sdf': resolve(__dirname, './src/shims/bitmap-sdf-default.cjs'),
  'lerc/LercDecode.js': resolve(__dirname, './src/shims/lerc-default.cjs'),
  'nosleep.js/src/index.js': resolve(__dirname, './src/shims/nosleep-default.cjs'),
    },
  },
  define: {
    // Define global constants for Cesium
    CESIUM_BASE_URL: JSON.stringify('/cesium/'),
  },
  server: {
    port: 3000,
    host: true,
    // Proxy backend timeline API to Spring Boot running on 8082 (dev only)
    proxy: {
      '/api/timeline': {
        target: 'http://localhost:8082',
        changeOrigin: true,
        secure: false,
        ws: false,
      },
      // Ensure nested paths also proxied
      '/api/timeline/**': {
        target: 'http://localhost:8082',
        changeOrigin: true,
        secure: false,
        ws: false,
      },
      // Baseline snapshot + resync endpoints
      '/api/baseline': {
        target: 'http://localhost:8082',
        changeOrigin: true,
        secure: false,
        ws: false,
      },
      '/api/baseline/**': {
        target: 'http://localhost:8082',
        changeOrigin: true,
        secure: false,
        ws: false,
      },
      '/api/frame': {
        target: 'http://localhost:8082',
        changeOrigin: true,
        secure: false,
      },
      '/api/frame/**': {
        target: 'http://localhost:8082',
        changeOrigin: true,
        secure: false,
      }
      ,
      // Rust Belt backend (non-SSE)
      '/api/rustbelt': {
        target: 'http://localhost:8084',
        changeOrigin: true,
        secure: false,
      },
      '/api/rustbelt/**': {
        target: 'http://localhost:8084',
        changeOrigin: true,
        secure: false,
      },
      // Election simulation & control endpoints
      '/api/election': {
        target: 'http://localhost:8082',
        changeOrigin: true,
        secure: false,
      },
      '/api/election/**': {
        target: 'http://localhost:8082',
        changeOrigin: true,
        secure: false,
      },
      // Color scale metadata (if requested)
      '/api/colors': {
        target: 'http://localhost:8082',
        changeOrigin: true,
        secure: false,
      },
      '/api/colors/**': {
        target: 'http://localhost:8082',
        changeOrigin: true,
        secure: false,
      }
      ,
      // Canada deck backend (baselines/timeline)
      '/api/canada': {
        target: 'http://localhost:9098',
        changeOrigin: true,
        secure: false,
      },
      '/api/canada/**': {
        target: 'http://localhost:9098',
        changeOrigin: true,
        secure: false,
      },
      // Canada swing endpoint (projections) unified to canada-deck-backend on 9098
      '/api/ca2021': {
        target: 'http://localhost:9098',
        changeOrigin: true,
        secure: false,
      },
      '/api/ca2021/**': {
        target: 'http://localhost:9098',
        changeOrigin: true,
        secure: false,
      },
      // Iowa scenario backend (baseline + compute)
      '/api/iowa-scenario': {
        target: 'http://localhost:8082',
        changeOrigin: true,
        secure: false,
      },
      '/api/iowa-scenario/**': {
        target: 'http://localhost:8082',
        changeOrigin: true,
        secure: false,
      }
    }
  },
  build: {
    rollupOptions: {
      external: ['cesium'],
      output: {
        manualChunks: {
          // Don't bundle cesium since we're using CDN
        }
      }
    },
  },
  optimizeDeps: {
  include: ['mersenne-twister','urijs','bitmap-sdf','lerc','nosleep.js'],
    exclude: ['cesium','grapheme-splitter'],
    esbuildOptions: {
      // Ensure CJS fallback if needed
      mainFields: ['module','main']
    }
  },
  assetsInclude: ['**/*.gltf', '**/*.glb'],
  publicDir: 'public',
})
