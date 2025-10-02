-- Chat Feedback Table
-- This table stores user feedback (thumbs up/down) for AI assistant responses
-- Used to track response quality and improve the model over time

CREATE TABLE IF NOT EXISTS chat_feedback (
    id SERIAL PRIMARY KEY,
    conversation_id TEXT NOT NULL,              -- Groups related messages in a chat session
    message_content TEXT NOT NULL,              -- The AI response that was rated
    feedback_type TEXT NOT NULL CHECK (feedback_type IN ('thumbs_up', 'thumbs_down')),
    context_info JSONB,                         -- Store RAG sources, search queries, document context
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    -- TODO: Add user_id when implementing multi-user support
    -- user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Create updated_at trigger using existing function
CREATE TRIGGER update_chat_feedback_updated_at 
    BEFORE UPDATE ON chat_feedback 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_chat_feedback_conversation_id ON chat_feedback(conversation_id);
CREATE INDEX IF NOT EXISTS idx_chat_feedback_type ON chat_feedback(feedback_type);
CREATE INDEX IF NOT EXISTS idx_chat_feedback_created_at ON chat_feedback(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_feedback_context_info ON chat_feedback USING GIN (context_info);

-- TODO: Add user_id index when implementing multi-user support
-- CREATE INDEX IF NOT EXISTS idx_chat_feedback_user_id ON chat_feedback(user_id);

-- Create unique constraint to prevent duplicate feedback for the same message
-- Users can change their feedback (update), but not create multiple entries
CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_feedback_unique_message 
    ON chat_feedback(conversation_id, message_content, feedback_type);

-- Optional: Create a view for analytics (aggregated feedback stats)
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
    END as context_type
FROM chat_feedback
GROUP BY feedback_type, DATE_TRUNC('day', created_at), 
         context_info->>'hasRAGSources', context_info->>'hasWebSearch'
ORDER BY feedback_date DESC, feedback_type;

-- Grant necessary permissions (adjust as needed for your setup)
-- GRANT SELECT, INSERT, UPDATE ON chat_feedback TO authenticated;
-- GRANT SELECT ON feedback_analytics TO authenticated;