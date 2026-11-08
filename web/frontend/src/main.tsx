import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router'
import { router } from './router'
import { startInstallPromptCapture } from './lib/pwaInstall'
import { retireReplacedServiceWorkers } from './lib/legacyServiceWorker'
import './styles.css'

startInstallPromptCapture()
// Retire the workers and caches left by the legacy UI at /public/sw.js and by
// this app's own retired /next/ mount. Fire-and-forget: it is a no-op once there
// is nothing to remove and must never delay first paint.
void retireReplacedServiceWorkers()

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: true,
    },
  },
})

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Root element #root not found')

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
)
