-- Add username column to users table
-- Run this migration manually if Prisma migrate is not working

-- Add username column (nullable, unique)
ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT;

-- Add unique constraint on username
ALTER TABLE users ADD CONSTRAINT users_username_key UNIQUE (username);

-- Create index on username for better query performance
CREATE INDEX IF NOT EXISTS "users_username_idx" ON users(username);

-- Verify the changes
\d users;
