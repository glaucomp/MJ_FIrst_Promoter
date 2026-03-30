-- Populate usernames for users without one
-- Auto-generates username from email (part before @)

-- This uses a PostgreSQL function to update usernames
DO $$
DECLARE
    user_record RECORD;
    base_username TEXT;
    final_username TEXT;
    counter INT;
BEGIN
    -- Loop through all users without username
    FOR user_record IN 
        SELECT id, email 
        FROM users 
        WHERE username IS NULL
    LOOP
        -- Extract username from email (part before @)
        base_username := lower(split_part(user_record.email, '@', 1));
        
        -- Replace non-alphanumeric characters with underscore
        base_username := regexp_replace(base_username, '[^a-z0-9_]', '_', 'g');
        
        -- Start with base username
        final_username := base_username;
        counter := 1;
        
        -- Check for uniqueness and increment if needed
        WHILE EXISTS (SELECT 1 FROM users WHERE username = final_username) LOOP
            final_username := base_username || counter::text;
            counter := counter + 1;
        END LOOP;
        
        -- Update the user with the new username
        UPDATE users 
        SET username = final_username 
        WHERE id = user_record.id;
        
        RAISE NOTICE '✅ % -> username: %', user_record.email, final_username;
    END LOOP;
    
    RAISE NOTICE '';
    RAISE NOTICE '✨ Done! All users now have usernames.';
END $$;

-- Verify the results
SELECT id, email, username, role 
FROM users 
ORDER BY "createdAt";
