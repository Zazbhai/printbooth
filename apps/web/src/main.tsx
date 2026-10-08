import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { configureBoneyard } from 'boneyard-js/react'
import './bones/registry'
import App from './App.tsx'
import './index.css'

configureBoneyard({
  color: 'rgba(163, 177, 198, 0.35)',
  darkColor: 'rgba(255, 255, 255, 0.08)',
  shimmerColor: 'rgba(255, 255, 255, 0.75)',
  animate: 'shimmer',
  transition: 280,
  stagger: false,
  select: 'viewport',
})

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 2,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)

