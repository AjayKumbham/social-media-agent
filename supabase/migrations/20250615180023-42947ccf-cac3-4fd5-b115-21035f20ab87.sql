
-- Add the missing columns to ai_settings table
ALTER TABLE public.ai_settings 
ADD COLUMN IF NOT EXISTS target_audience text DEFAULT 'developers',
ADD COLUMN IF NOT EXISTS ai_temperature integer DEFAULT 70;

-- Ensure unique constraint exists on user_id (in case it wasn't added before)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'ai_settings_user_id_key' 
        AND table_name = 'ai_settings'
    ) THEN
        ALTER TABLE public.ai_settings 
        ADD CONSTRAINT ai_settings_user_id_key UNIQUE (user_id);
    END IF;
END $$;
