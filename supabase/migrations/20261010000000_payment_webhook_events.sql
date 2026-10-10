-- Migration: 20261010000000_payment_webhook_events.sql
-- Description: Adds payment_webhook_events table with unique constraint for durable, distributed webhook deduplication

CREATE TABLE IF NOT EXISTS public.payment_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider VARCHAR(32) NOT NULL DEFAULT 'paystack',
  event_id VARCHAR(128) NOT NULL, -- Gateway provider event identifier (e.g. Paystack data.id or composite key)
  event_type VARCHAR(64) NOT NULL,
  reference VARCHAR(128) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'processed',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb,
  CONSTRAINT uq_payment_webhook_events_provider_event UNIQUE (provider, event_id)
);

CREATE INDEX IF NOT EXISTS idx_payment_webhook_events_reference ON public.payment_webhook_events(reference);
CREATE INDEX IF NOT EXISTS idx_payment_webhook_events_provider_event ON public.payment_webhook_events(provider, event_id);

-- Enable Row Level Security (RLS)
ALTER TABLE public.payment_webhook_events ENABLE ROW LEVEL SECURITY;

-- Service role has full access; anonymous / public read is prohibited
CREATE POLICY "service_role_manage_payment_webhook_events"
  ON public.payment_webhook_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
