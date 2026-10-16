-- ACTIONOS 2026: Enable Supabase Realtime Change Data Capture on Operational Tables
-- Enables sub-millisecond WebSocket updates for orchestration sessions, ledger events, and notifications.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'action_sessions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE action_sessions;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'action_steps'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE action_steps;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'action_ledger_events'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE action_ledger_events;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'renewals'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE renewals;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'transactions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE transactions;
  END IF;
END $$;
