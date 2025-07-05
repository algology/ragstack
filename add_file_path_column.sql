-- Add file_path column to documents table
ALTER TABLE documents 
ADD COLUMN file_path TEXT NULL;

-- Add comment to document the column
COMMENT ON COLUMN documents.file_path IS 'Path to the stored PDF file, relative to project root'; 