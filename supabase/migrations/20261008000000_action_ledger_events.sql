-- ACTIONOS MIGRATION: ACTION LEDGER EVENTS TABLE
-- Immutable, tamper-evident cryptographic action ledger for ActionOS workflows

CREATE TABLE IF NOT EXISTS action_ledger_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES action_sessions(id) ON DELETE CASCADE,
  sequence_number INT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  action TEXT NOT NULL,
  description TEXT NOT NULL,
  actor TEXT NOT NULL,
  status TEXT NOT NULL,
  tool TEXT,
  reference_id TEXT,
  previous_hash TEXT NOT NULL,
  event_hash TEXT NOT NULL,
  signature TEXT NOT NULL,
  signing_key_version TEXT NOT NULL DEFAULT 'v1',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(session_id, sequence_number)
);

-- Indexes for high-throughput sequential audit reads
CREATE INDEX IF NOT EXISTS idx_ledger_session ON action_ledger_events(session_id);
CREATE INDEX IF NOT EXISTS idx_ledger_session_seq ON action_ledger_events(session_id, sequence_number ASC);
CREATE INDEX IF NOT EXISTS idx_ledger_timestamp ON action_ledger_events(timestamp DESC);

-- Enable RLS
ALTER TABLE action_ledger_events ENABLE ROW LEVEL SECURITY;

-- Read policy: Users can read ledger events for action sessions within their organization
CREATE POLICY "Users can read ledger events for their organization sessions"
  ON action_ledger_events
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM action_sessions s
      JOIN organization_members om ON om.organization_id = s.organization_id
      JOIN profiles p ON p.id = om.profile_id
      WHERE s.id = action_ledger_events.session_id
      AND p.auth_user_id = auth.uid()
    )
  );

-- Service role full access for orchestrator execution
CREATE POLICY "Service role can manage all action ledger events"
  ON action_ledger_events
  FOR ALL
  USING (auth.jwt()->>'role' = 'service_role');
