import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // MOEX market data changes often, but a short cache keeps back/forward navigation snappy.
      staleTime: 30_000,
      retry: 1,
    },
  },
});
