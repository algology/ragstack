-- Backfill page numbers for existing document chunks
-- This script estimates page numbers based on chunk order and typical chunk size

-- For documents without page numbers, estimate page numbers based on:
-- - Chunk position within the document
-- - Assuming ~3-5 chunks per page (based on 500 char chunks and typical page content)

WITH numbered_chunks AS (
  SELECT 
    id,
    document_id,
    ROW_NUMBER() OVER (PARTITION BY document_id ORDER BY id) as chunk_order,
    CASE 
      -- Estimate page number: every 4 chunks = 1 page (rough estimate)
      WHEN page_number IS NULL THEN GREATEST(1, CEILING((ROW_NUMBER() OVER (PARTITION BY document_id ORDER BY id))::float / 4))
      ELSE page_number
    END as estimated_page_number
  FROM document_chunks
)
UPDATE document_chunks 
SET page_number = numbered_chunks.estimated_page_number
FROM numbered_chunks 
WHERE document_chunks.id = numbered_chunks.id 
  AND document_chunks.page_number IS NULL;

-- Verify the update
SELECT 
  d.name,
  COUNT(*) as total_chunks,
  MIN(dc.page_number) as min_page,
  MAX(dc.page_number) as max_page,
  COUNT(CASE WHEN dc.page_number IS NULL THEN 1 END) as null_pages
FROM documents d
JOIN document_chunks dc ON d.id = dc.document_id
GROUP BY d.id, d.name
ORDER BY d.id;