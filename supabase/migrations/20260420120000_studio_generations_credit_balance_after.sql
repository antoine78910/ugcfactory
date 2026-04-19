-- Snapshot of display credit balance after a generation row is registered (ledger-based).
alter table public.studio_generations
  add column if not exists credit_balance_after numeric;

comment on column public.studio_generations.credit_balance_after is
  'User credit balance (display credits) shortly after this row was inserted; best-effort snapshot for admin.';
