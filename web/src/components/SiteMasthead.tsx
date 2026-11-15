import { ArrowUpRight } from 'lucide-react'
import { Link } from 'react-router-dom'

export function SiteMasthead({ atlasHref, onAtlas, onSources, onSignup }: { atlasHref: string; onAtlas?: () => void; onSources: () => void; onSignup: () => void }) {
  return (
    <nav className="editorial-mast" aria-label="Primary">
      <Link className="editorial-brand" to="/">Trend Atlas</Link>
      <div className="editorial-nav-links">
        <Link to={atlasHref} onClick={(event) => {
          if (!onAtlas || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
          event.preventDefault()
          onAtlas()
        }}>Atlas</Link>
        <button type="button" onClick={onSources}>Sources</button>
        <button type="button" onClick={onSignup} className="editorial-signup">Sign up <ArrowUpRight size={14} aria-hidden="true" /></button>
      </div>
    </nav>
  )
}
