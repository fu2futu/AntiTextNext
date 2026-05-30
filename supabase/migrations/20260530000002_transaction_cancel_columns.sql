ALTER TABLE public.transactions
ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;

COMMENT ON COLUMN public.transactions.cancelled_at IS 'Timestamp when a consultation/request was cancelled or withdrawn.';
COMMENT ON COLUMN public.transactions.cancellation_reason IS 'Reason shown to the counterpart when a consultation/request is cancelled or withdrawn.';

NOTIFY pgrst, 'reload schema';
