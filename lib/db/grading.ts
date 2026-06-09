// Grading queue hooks. Reads from the cloud_card_grading mirror; mutations
// go through the offline op queue (see cloud-sync.ts).

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getDb } from './database';
import {
  deleteGradingSubmission,
  upsertGradingSubmission,
  GradingStage,
  GradingUpsertInput,
} from './cloud-sync';
import { useAuth } from '@/lib/auth/AuthContext';

export const GRADING_STAGES: GradingStage[] = [
  'received', 'research', 'grading', 'shipped_back', 'completed',
];

export const STAGE_LABEL: Record<GradingStage, string> = {
  received:     'Received',
  research:     'Research',
  grading:      'Grading',
  shipped_back: 'Shipped back',
  completed:    'Completed',
};

export interface GradingSubmission {
  id:             string;
  card_id:        string;
  card_name:      string;
  card_set:       string | null;
  grader:         string;
  submission_id:  string | null;
  stage:          GradingStage;
  submitted_at:   number;
  returned_at:    number | null;
  returned_grade: string | null;
  declared_value: number | null;
  notes:          string | null;
}

/** Active queue: every submission not yet `completed`. */
export function useGradingQueue() {
  const { user } = useAuth();
  return useQuery<GradingSubmission[]>({
    queryKey: ['grading-queue', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const db = await getDb();
      const rows = await db.getAllAsync<GradingSubmission>(
        `SELECT id, card_id, card_name, card_set, grader, submission_id, stage,
                submitted_at, returned_at, returned_grade, declared_value, notes
           FROM cloud_card_grading
          WHERE user_id = ?
          ORDER BY
            CASE stage
              WHEN 'shipped_back' THEN 0
              WHEN 'grading'      THEN 1
              WHEN 'research'     THEN 2
              WHEN 'received'     THEN 3
              WHEN 'completed'    THEN 4
            END,
            submitted_at DESC`,
        [user.id],
      );
      return rows;
    },
  });
}

export function useUpsertGrading() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return async (input: Omit<GradingUpsertInput, 'userId'>): Promise<string> => {
    if (!user) throw new Error('Sign in to track grading submissions.');
    const id = await upsertGradingSubmission({ ...input, userId: user.id });
    queryClient.invalidateQueries({ queryKey: ['grading-queue', user.id] });
    return id;
  };
}

export function useDeleteGrading() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return async (id: string): Promise<void> => {
    if (!user) throw new Error('Sign in to manage your grading queue.');
    await deleteGradingSubmission(id);
    queryClient.invalidateQueries({ queryKey: ['grading-queue', user.id] });
  };
}
