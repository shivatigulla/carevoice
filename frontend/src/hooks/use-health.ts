import { useQuery } from '@tanstack/react-query'

import { fetchHealth } from '@/lib/api'

export function useHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: ({ signal }) => fetchHealth(signal),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    retry: 0,
    staleTime: 10_000,
  })
}
