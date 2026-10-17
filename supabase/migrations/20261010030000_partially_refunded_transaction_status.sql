-- Migration: 20261010030000_partially_refunded_transaction_status.sql
-- Description: Adds partially_refunded status to transaction_status enum for first-class partial refund tracking

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'transaction_status' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.transaction_status AS ENUM (
      'pending', 'processing', 'succeeded', 'failed', 'refunded', 'partially_refunded'
    );
  END IF;
END $$;

ALTER TYPE public.transaction_status ADD VALUE IF NOT EXISTS 'partially_refunded';
