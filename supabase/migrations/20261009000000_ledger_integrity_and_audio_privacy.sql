-- ACTIONOS MIGRATION: 20261009000000_ledger_integrity_and_audio_privacy.sql
-- Enforces integrity columns for Action Ledger events and explicit audio privacy retention

-- Add event_class and is_compensating columns to action_ledger_events
ALTER TABLE action_ledger_events 
  ADD COLUMN IF NOT EXISTS event_class TEXT DEFAULT 'informational',
  ADD COLUMN IF NOT EXISTS is_compensating BOOLEAN DEFAULT FALSE;

-- Ensure explicit documentation on action_sessions audio policy
COMMENT ON COLUMN action_sessions.input_audio_url IS 'Transient audio reference; nullified when rawInputRetained is false';
