import { QueryClient } from '@tanstack/react-query'

import { ConfigError } from '@/lib/supabase'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      // Misconfiguration won't fix itself by retrying.
      retry: (failureCount, error) => !(error instanceof ConfigError) && failureCount < 2,
    },
  },
})
