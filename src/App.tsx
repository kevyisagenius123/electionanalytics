import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import HomePage from './pages/HomePage'
import RustBeltSwing3DPage from './pages/RustBeltSwing3DPage'
import Dashboard from './pages/Dashboard'
import CanadaSwingDeckPage from './pages/CanadaSwingDeckPage'
import Quebec1995Page from './pages/Quebec1995Page'
import ElectionNight2024Page from './pages/ElectionNight2024Page'
import './App.css'

function App() {
  return (
    <Router basename="/electionanalytics">
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/rustbelt-swing-3d" element={<RustBeltSwing3DPage />} />
        <Route path="/election-night-2024" element={<ElectionNight2024Page />} />
        <Route path="/simulation" element={<Dashboard />} />
        <Route path="/canada-swing" element={<CanadaSwingDeckPage />} />
        <Route path="/quebec-1995" element={<Quebec1995Page />} />
      </Routes>
    </Router>
  )
}

export default App
