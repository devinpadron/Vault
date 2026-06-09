-- TIER 5 — app layer. Grading queue tracker.
--
-- Lets users log cards sent off to PSA / CGC / BGS / TAG / ACE and follow
-- them through the grading lifecycle. Distinct from collection_items: a
-- submission references a card_id but the card may or may not still be in
-- the user's collection (it's been mailed away).
--
-- Stages map to the steps every grader publishes on their pop pages:
--   received     — package logged at the grader
--   research     — pre-grade research (CGC) / queue (PSA)
--   grading      — actively being graded
--   shipped_back — graded & in return shipment
--   completed    — back in the user's hands

create table if not exists card_grading_submissions (
  id              uuid          primary key default gen_random_uuid(),
  user_id         uuid          not null references auth.users (id) on delete cascade,
  card_id         text          not null references cards (id),
  card_name       text          not null,
  card_set        text,
  grader          text          not null check (grader in ('PSA', 'CGC', 'BGS', 'TAG', 'ACE')),
  submission_id   text,                                  -- external tracking #
  stage           text          not null default 'received'
                    check (stage in ('received', 'research', 'grading', 'shipped_back', 'completed')),
  submitted_at    date          not null default current_date,
  returned_at     date,
  returned_grade  text,                                  -- '10' / '9.5' / etc
  declared_value  numeric(12,2),
  notes           text,
  created_at      timestamptz   not null default now(),
  updated_at      timestamptz   not null default now()
);

comment on table card_grading_submissions is
  'TIER 5 — app layer. Grading queue tracker. RLS enabled.';

create index if not exists card_grading_user_idx
  on card_grading_submissions (user_id, stage, submitted_at desc);

create or replace trigger card_grading_set_updated_at
  before update on card_grading_submissions
  for each row execute function set_updated_at();

alter table card_grading_submissions enable row level security;

create policy "card_grading: owner only"
  on card_grading_submissions for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
