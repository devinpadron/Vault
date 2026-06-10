// Surfaces the dead-letter state of the offline write queue (pending_ops
// rows parked with status='failed' after exhausting retries) so the UI can
// offer retry/discard instead of losing mutations silently.

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { discardFailedOps, getFailedOpsCount, retryFailedOps } from './cloud-sync';

const FAILED_OPS_KEY = ['failed-ops-count'];

export function useFailedOpsCount() {
  return useQuery({
    queryKey: FAILED_OPS_KEY,
    queryFn: getFailedOpsCount,
    refetchInterval: 30_000,
  });
}

export function useRetryFailedOps() {
  const queryClient = useQueryClient();
  return async () => {
    await retryFailedOps();
    queryClient.invalidateQueries({ queryKey: FAILED_OPS_KEY });
  };
}

export function useDiscardFailedOps() {
  const queryClient = useQueryClient();
  return async () => {
    await discardFailedOps();
    queryClient.invalidateQueries({ queryKey: FAILED_OPS_KEY });
  };
}
