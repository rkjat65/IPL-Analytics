import { Component } from 'react'
import { appPath } from '../lib/site'

const CHUNK_ERROR = /Loading chunk|dynamically imported module|Importing a module script failed|ChunkLoadError/i

// Keeps one broken page from blanking the whole app. A stale chunk after a
// deploy reloads once on its own; anything else shows a retry.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error) {
    if (CHUNK_ERROR.test(String(error?.message || error))) {
      let reloaded = false
      try { reloaded = sessionStorage.getItem('crickrida-chunk-reload') === '1' } catch { /* storage blocked */ }
      if (!reloaded) {
        try { sessionStorage.setItem('crickrida-chunk-reload', '1') } catch { /* storage blocked */ }
        window.location.reload()
      }
    }
  }

  componentDidUpdate(prevProps) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null })
    }
  }

  render() {
    if (!this.state.error) return this.props.children
    const stale = CHUNK_ERROR.test(String(this.state.error?.message || this.state.error))
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4 text-center px-6">
        <p className="text-danger font-heading text-lg">{stale ? 'A new version of Crickrida is available' : 'This page hit an error'}</p>
        <p className="text-text-secondary text-sm max-w-md">
          {stale ? 'Reload to pick up the latest build.' : String(this.state.error?.message || 'Something went wrong while rendering this page.')}
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-4 py-2 rounded-md bg-accent-brand text-bg-primary text-sm font-semibold"
          >
            Reload
          </button>
          <a href={appPath('/dashboard')} className="px-4 py-2 rounded-md border border-border-subtle text-sm text-text-primary">Dashboard</a>
        </div>
      </div>
    )
  }
}
