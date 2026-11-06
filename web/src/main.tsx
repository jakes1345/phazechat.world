import { Component, StrictMode, type ErrorInfo, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// VITE_SENTRY_DSN comes from build env. The SDK is only downloaded when a
// DSN is set, so builds without error reporting don't ship it. We scrub
// request payloads in beforeSend: DM bodies are E2EE blobs anyway and
// shouldn't ride out to a third party even by accident.
type SentryModule = typeof import('@sentry/react')
let sentry: SentryModule | null = null
const dsn = (import.meta.env.VITE_SENTRY_DSN as string | undefined) || ''
if (dsn) {
  void import('@sentry/react').then((S) => {
    S.init({
      dsn,
      environment: (import.meta.env.VITE_SENTRY_ENV as string) || 'production',
      release: (import.meta.env.VITE_BUILD_VERSION as string) || undefined,
      tracesSampleRate: 0.05,
      beforeSend(event) {
        if (event.request?.data) event.request.data = '[scrubbed]'
        return event
      },
    })
    sentry = S
  }).catch((e) => console.warn('[sentry] failed to load', e))
}

// Catches render errors so a crash shows a way out instead of a blank page,
// and reports them when Sentry is configured.
class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error(error)
    sentry?.captureException(error, { extra: { componentStack: info.componentStack } })
  }
  render() {
    if (this.state.failed) {
      return (
        <div style={{ padding: 24, fontFamily: 'Inter, system-ui, sans-serif' }}>
          Something broke. <button type="button" onClick={() => window.location.reload()}>Reload Phaze</button>
        </div>
      )
    }
    return this.props.children
  }
}

// Register the service worker for the offline app shell. This is independent of
// push: push subscription is requested later, on user opt-in, in Settings. We
// skip it in dev so Vite's HMR isn't shadowed by a cached shell.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
      .catch((e) => console.warn('[sw] registration failed', e))
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>,
)
