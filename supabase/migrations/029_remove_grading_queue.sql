-- 029: Remove the grading-queue feature entirely.
--
-- Product decision: the in-app tracker for cards mailed off to PSA / CGC / BGS
-- (added in migration 015) is removed. Graded *copies* in a collection are
-- unaffected — those live on collection_items (grader / grade / cert_number)
-- and have their own pricing path; this only drops the submission tracker.
--
-- CASCADE also removes the dependent objects added later: the
-- card_grading_submissions_card_id_idx index and the "card_grading: owner only"
-- RLS policy (migration 023).

drop table if exists card_grading_submissions cascade;
