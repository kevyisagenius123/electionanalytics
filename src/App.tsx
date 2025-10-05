import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import RustBeltSwing3DPage from './pages/RustBeltSwing3DPage'
import './App.css'

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<RustBeltSwing3DPage />} />
        <Route path="/rustbelt-swing-3d" element={<RustBeltSwing3DPage />} />
        {/* All other routes removed - only Rust Belt Swingometer deployed */}
      </Routes>
    </Router>
  )
}

export default App
