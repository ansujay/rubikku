import { HashRouter } from 'react-router-dom'
import { MotionProvider } from '../ui'
import { AppShell } from './AppShell'
import { ErrorBoundary } from './ErrorBoundary'

export function App() {
  return (
    <ErrorBoundary>
      <MotionProvider>
        <HashRouter>
          <AppShell />
        </HashRouter>
      </MotionProvider>
    </ErrorBoundary>
  )
}
