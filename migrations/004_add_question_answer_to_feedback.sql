-- Add Question and Answer tracking to chat_feedback table
-- This migration enhances the feedback system to capture both user questions and AI responses
-- for better context understanding in the admin dashboard

-- Add new columns for question and answer tracking
ALTER TABLE chat_feedback 
ADD COLUMN IF NOT EXISTS user_question TEXT,
ADD COLUMN IF NOT EXISTS ai_response TEXT;

-- Migrate existing data: copy message_content to ai_response for backward compatibility
UPDATE chat_feedback 
SET ai_response = message_content 
WHERE ai_response IS NULL AND message_content IS NOT NULL;

-- Add indexes for better query performance on the new columns
CREATE INDEX IF NOT EXISTS idx_chat_feedback_user_question ON chat_feedback USING GIN (to_tsvector('english', user_question));
CREATE INDEX IF NOT EXISTS idx_chat_feedback_ai_response ON chat_feedback USING GIN (to_tsvector('english', ai_response));

-- Update the feedback_analytics view to include question/answer aggregations
DROP VIEW IF EXISTS feedback_analytics;

CREATE OR REPLACE VIEW feedback_analytics AS

SELECT 
    feedback_type,
    COUNT(*) as total_count,
    DATE_TRUNC('day', created_at) as feedback_date,
    -- Extract common context patterns for analysis
    CASE 
        WHEN context_info->>'hasRAGSources' = 'true' THEN 'with_rag'
        WHEN context_info->>'hasWebSearch' = 'true' THEN 'with_web_search'
        ELSE 'no_context'
    END as context_type,
    -- Add aggregated text length statistics
    AVG(LENGTH(COALESCE(user_question, ''))) as avg_question_length,
    AVG(LENGTH(COALESCE(ai_response, message_content, ''))) as avg_response_length
FROM chat_feedback
GROUP BY feedback_type, DATE_TRUNC('day', created_at), 
         context_info->>'hasRAGSources', context_info->>'hasWebSearch'
ORDER BY feedback_date DESC, feedback_type;

-- Add comment for documentation
COMMENT ON COLUMN chat_feedback.user_question IS 'The user''s original question or prompt that led to the AI response';
COMMENT ON COLUMN chat_feedback.ai_response IS 'The AI assistant''s response that was rated by the user';

-- Grant necessary permissions (adjust as needed for your setup)
-- GRANT SELECT, INSERT, UPDATE ON chat_feedback TO authenticated;
-- GRANT SELECT ON feedback_analytics TO authenticated;