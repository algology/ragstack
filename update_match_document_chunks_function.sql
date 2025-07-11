-- Update match_document_chunks function to include page_number in results
-- Note: This function likely exists in Supabase and needs to be updated to include page_number

-- Drop the existing function first
DROP FUNCTION IF EXISTS match_document_chunks(query_embedding vector(1536), match_threshold float, match_count int, filter_document_id int);

-- Recreate with page_number included
CREATE OR REPLACE FUNCTION match_document_chunks(
  query_embedding vector(1536),
  match_threshold float,
  match_count int,
  filter_document_id int DEFAULT NULL
)
RETURNS TABLE(
  id int,
  document_id int,
  content text,
  name text,
  page_number int,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    dc.id,
    dc.document_id,
    dc.content,
    d.name,
    dc.page_number,
    1 - (dc.embedding <=> query_embedding) AS similarity
  FROM document_chunks dc
  JOIN documents d ON d.id = dc.document_id
  WHERE (filter_document_id IS NULL OR dc.document_id = filter_document_id)
    AND (1 - (dc.embedding <=> query_embedding)) > match_threshold
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;