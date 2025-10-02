-- Improved Feedback Analytics and Constraints
-- This migration fixes potential issues with the feedback system

-- First, drop the problematic unique constraint that includes feedback_type
-- This allows users to change their feedback from thumbs_up to thumbs_down
DROP INDEX IF EXISTS idx_chat_feedback_unique_message;

-- Create a better unique constraint that allows feedback changes
-- Users should only have one feedback entry per message, but can change the type
CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_feedback_unique_message_per_user 
    ON chat_feedback(conversation_id, message_content);

-- Improve the analytics view to handle edge cases better
CREATE OR REPLACE VIEW feedback_analytics AS
SELECT 
    COALESCE(feedback_type, 'unknown') as feedback_type,
    COUNT(*) as total_count,
    DATE_TRUNC('day', COALESCE(created_at, NOW())) as feedback_date,
    -- Improved context pattern analysis with null handling
    CASE 
        WHEN context_info IS NULL THEN 'no_context'
        WHEN context_info->>'hasRAGSources' = 'true' THEN 'with_rag'
        WHEN context_info->>'hasWebSearch' = 'true' THEN 'with_web_search'
        ELSE 'no_context'
    END as context_type
FROM chat_feedback
WHERE feedback_type IN ('thumbs_up', 'thumbs_down') -- Only include valid feedback types
    AND created_at IS NOT NULL -- Ensure we have valid timestamps
    AND created_at >= NOW() - INTERVAL '90 days' -- Only include recent data for performance
GROUP BY 
    feedback_type, 
    DATE_TRUNC('day', created_at), 
    CASE 
        WHEN context_info IS NULL THEN 'no_context'
        WHEN context_info->>'hasRAGSources' = 'true' THEN 'with_rag'
        WHEN context_info->>'hasWebSearch' = 'true' THEN 'with_web_search'
        ELSE 'no_context'
    END
ORDER BY feedback_date DESC, feedback_type;

-- Create a summary view for quick stats
CREATE OR REPLACE VIEW feedback_summary AS
SELECT 
    COUNT(*) as total_feedback,
    COUNT(*) FILTER (WHERE feedback_type = 'thumbs_up') as thumbs_up,
    COUNT(*) FILTER (WHERE feedback_type = 'thumbs_down') as thumbs_down,
    ROUND(
        COUNT(*) FILTER (WHERE feedback_type = 'thumbs_up')::numeric / 
        NULLIF(COUNT(*), 0) * 100, 
        2
    ) as positive_rate,
    DATE_TRUNC('day', NOW()) as calculated_at
FROM chat_feedback
WHERE feedback_type IN ('thumbs_up', 'thumbs_down')
    AND created_at >= NOW() - INTERVAL '90 days';

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_chat_feedback_created_at_recent 
    ON chat_feedback(created_at DESC) 
    WHERE created_at >= NOW() - INTERVAL '90 days';

CREATE INDEX IF NOT EXISTS idx_chat_feedback_type_recent 
    ON chat_feedback(feedback_type, created_at DESC) 
    WHERE created_at >= NOW() - INTERVAL '90 days';

-- Add a trigger to validate feedback_type on insert/update
CREATE OR REPLACE FUNCTION validate_feedback_type()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.feedback_type NOT IN ('thumbs_up', 'thumbs_down') THEN
        RAISE EXCEPTION 'Invalid feedback_type: %. Must be thumbs_up or thumbs_down', NEW.feedback_type;
    END IF;
    
    IF NEW.message_content IS NULL OR trim(NEW.message_content) = '' THEN
        RAISE EXCEPTION 'message_content cannot be null or empty';
    END IF;
    
    IF NEW.conversation_id IS NULL OR trim(NEW.conversation_id) = '' THEN
        RAISE EXCEPTION 'conversation_id cannot be null or empty';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger
DROP TRIGGER IF EXISTS validate_feedback_trigger ON chat_feedback;
CREATE TRIGGER validate_feedback_trigger
    BEFORE INSERT OR UPDATE ON chat_feedback
    FOR EACH ROW
    EXECUTE FUNCTION validate_feedback_type();

-- Grant permissions for the new views
-- GRANT SELECT ON feedback_summary TO authenticated;
-- GRANT SELECT ON feedback_analytics TO authenticated;