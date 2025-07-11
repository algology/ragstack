-- Add page_number column to document_chunks table
ALTER TABLE document_chunks 
ADD COLUMN page_number INTEGER NULL;

-- Add comment to document the column
COMMENT ON COLUMN document_chunks.page_number IS 'Page number where this chunk appears in the original PDF document';

-- Create index to improve query performance when filtering by page number
CREATE INDEX idx_document_chunks_page_number ON document_chunks(page_number);