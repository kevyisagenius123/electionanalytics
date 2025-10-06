import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import HomePage from './pages/HomePage'
import RustBeltSwing3DPage from './pages/RustBeltSwing3DPage'
import './App.css'

function App() {
  return (
    <Router basename="/electionanalytics">
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/rustbelt-swing-3d" element={<RustBeltSwing3DPage />} />
      </Routes>
    </Router>
  )
}

export default App
