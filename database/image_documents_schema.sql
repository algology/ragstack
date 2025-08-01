-- Image Documents Table
-- This table stores metadata for uploaded images that can be used in RAG conversations
-- Images can have optional text descriptions and are stored in Supabase Storage

CREATE TABLE IF NOT EXISTS image_documents (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,                    -- Original filename
    file_path TEXT NOT NULL,               -- Path to image in Supabase Storage
    description TEXT,                      -- Optional user-provided description
    mime_type TEXT NOT NULL,               -- Image MIME type (image/jpeg, image/png, etc.)
    file_size INTEGER,                     -- File size in bytes
    width INTEGER,                         -- Image width in pixels
    height INTEGER,                        -- Image height in pixels
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    -- TODO: Add user_id when implementing multi-user support
    -- user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_image_documents_updated_at 
    BEFORE UPDATE ON image_documents 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_image_documents_created_at ON image_documents(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_image_documents_name ON image_documents(name);
-- TODO: Add user_id index when implementing multi-user support
-- CREATE INDEX IF NOT EXISTS idx_image_documents_user_id ON image_documents(user_id);

-- Create a view that combines image documents with text content for RAG queries
-- This allows images with descriptions to be included in document searches
CREATE OR REPLACE VIEW searchable_image_documents AS
SELECT 
    id,
    name,
    file_path,
    description,
    mime_type,
    'image' as document_type,
    created_at
FROM image_documents
WHERE description IS NOT NULL AND LENGTH(TRIM(description)) > 0;

-- Create Supabase Storage policies (run these in Supabase Dashboard)
-- 1. Create 'images' bucket if it doesn't exist
-- 2. Set up RLS policies for the bucket

-- Example RLS policies for images bucket (run in Supabase Dashboard):
-- INSERT: Allow authenticated users to upload images
-- INSERT ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'images' AND auth.role() = 'authenticated');

-- SELECT: Allow public read access to images
-- SELECT ON storage.objects FOR SELECT USING (bucket_id = 'images');

-- UPDATE: Allow users to update their own images (when user_id is implemented)
-- UPDATE ON storage.objects FOR UPDATE USING (bucket_id = 'images' AND auth.role() = 'authenticated');

-- DELETE: Allow users to delete their own images (when user_id is implemented)  
-- DELETE ON storage.objects FOR DELETE USING (bucket_id = 'images' AND auth.role() = 'authenticated');