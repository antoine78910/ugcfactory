-- Cal.com onboarding calls: T-12h reminder email + attendee confirmation (yes/no).

create table if not exists public.onboarding_cal_reminders (
  id uuid primary key default gen_random_uuid(),
  cal_booking_uid text not null unique,
  event_type_slug text,
  attendee_email text not null,
  attendee_name text,
  event_title text,
  start_time timestamptz not null,
  end_time timestamptz,
  reminder_send_at timestamptz not null,
  reminder_sent_at timestamptz,
  confirmation_token text not null unique,
  attendee_confirmed_at timestamptz,
  attendee_declined_at timestamptz,
  cal_cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists onboarding_cal_reminders_due_idx
  on public.onboarding_cal_reminders (reminder_send_at)
  where reminder_sent_at is null and cal_cancelled_at is null;

alter table public.onboarding_cal_reminders enable row level security;
