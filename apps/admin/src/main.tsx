import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { configureBoneyard } from 'boneyard-js/react'
import './bones/registry'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'
import App from './App.tsx'
import './index.css'

configureBoneyard({
  color: 'rgba(15, 23, 42, 0.06)',
  darkColor: 'rgba(255, 255, 255, 0.08)',
  shimmerColor: 'rgba(15, 23, 42, 0.13)',
  darkShimmerColor: 'rgba(255, 255, 255, 0.16)',
  animate: 'shimmer',
  transition: 280,
  stagger: false,
  select: 'viewport',
})

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 15_000, retry: 2 } },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
)

