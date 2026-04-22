-- Add PAYER to the UserType enum.
-- Payers are created exclusively by admins and only see Reports, Payouts and
-- Settings in the UI. They have no referrals, no commissions and no AM.
ALTER TYPE "UserType" ADD VALUE 'PAYER';
