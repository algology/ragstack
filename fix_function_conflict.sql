-- Fix database function conflict by cleaning up all variants and recreating properly
-- This resolves the "Could not choose the best candidate function" error

-- Step 1: Drop ALL possible variants of the match_document_chunks function
-- We need to be very specific about parameter types to ensure all variants are removed

-- Drop function with integer filter_document_id (the one we created)
DROP FUNCTION IF EXISTS match_document_chunks(
  query_embedding vector(1536), 
  match_threshold float, 
  match_count int, 
  filter_document_id int
);

-- Drop function with bigint filter_document_id (likely the original)
DROP FUNCTION IF EXISTS match_document_chunks(
  query_embedding vector(1536), 
  match_threshold float, 
  match_count int, 
  filter_document_id bigint
);

-- Drop any variant without the filter parameter
DROP FUNCTION IF EXISTS match_document_chunks(
  query_embedding vector(1536), 
  match_threshold float, 
  match_count int
);

-- Drop any variant with different parameter names or orders
DROP FUNCTION IF EXISTS match_document_chunks(
  vector(1536), 
  float, 
  int, 
  bigint
);

-- Drop any variant with different parameter names or orders
DROP FUNCTION IF EXISTS match_document_chunks(
  vector(1536), 
  float, 
  int, 
  int
);

-- Step 2: Recreate the function with the correct signature
-- Use bigint for filter_document_id to match Supabase's document ID type
-- Include page_number in the return type for citation navigation

CREATE OR REPLACE FUNCTION match_document_chunks(
  query_embedding vector(1536),
  match_threshold float,
  match_count int,
  filter_document_id bigint DEFAULT NULL
)
RETURNS TABLE(
  id bigint,
  document_id bigint,
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