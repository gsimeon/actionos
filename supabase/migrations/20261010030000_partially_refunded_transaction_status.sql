-- Migration: 20261010030000_partially_refunded_transaction_status.sql
-- Description: Adds partially_refunded status to transaction_status enum for first-class partial refund tracking

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = 'public.transaction_status'::regtype
      AND enumlabel = 'partially_refunded'
  ) THEN
    ALTER TYPE public.transaction_status ADD VALUE 'partially_refunded';
  END IF;
END $$;
