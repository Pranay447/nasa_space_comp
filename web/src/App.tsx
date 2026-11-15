import { useState } from 'react'
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom'
import { SignupDialog } from '@/components/SignupDialog'
import { SourcesDialog } from '@/components/SourcesDialog'
import { AtlasPage } from '@/pages/AtlasPage'
import { HomePage } from '@/pages/HomePage'

export default function App() {
  return <BrowserRouter><AppRoutes /></BrowserRouter>
}

function AppRoutes() {
  const { pathname } = useLocation()
  const [sources, setSources] = useState(false)
  const [signup, setSignup] = useState(false)
  return (
    <>
      <div className="route-enter" key={pathname}><Routes>
        <Route path="/" element={<HomePage onSignup={() => setSignup(true)} onSources={() => setSources(true)} />} />
        <Route path="/atlas" element={<AtlasPage onSources={() => setSources(true)} onSignup={() => setSignup(true)} />} />
        <Route path="*" element={<HomePage onSignup={() => setSignup(true)} onSources={() => setSources(true)} />} />
      </Routes></div>
      <SourcesDialog open={sources} onClose={() => setSources(false)} />
      <SignupDialog open={signup} onClose={() => setSignup(false)} />
    </>
  )
}
