# PDF Citation Accuracy Improvements

## Summary of Changes

I've implemented comprehensive improvements to address the PDF citation page accuracy issues you identified. The changes target the root causes of incorrect page citations while maintaining backward compatibility.

## New Features Added

### 1. Citation Debugging API (`/api/debug-citations`)
**Usage:** `POST /api/debug-citations` with `{ "query": "your question", "documentId": "optional" }`

**What it shows:**
- All chunks found for the query with their page numbers and similarity scores
- Page-level score analysis showing which pages are most relevant
- Potential issues like page gaps, score mismatches, and chunking problems
- Detailed breakdown of the deduplication logic decisions

**Example response:**
```json
{
  "query": "wine harvest timing",
  "totalChunksFound": 8,
  "pageAnalysis": [
    {
      "documentName": "Wine Guide.pdf",
      "allMatchingPages": [3, 4, 6],
      "primaryPage": 4,
      "pageScoreDistribution": [
        { "page": 4, "avgScore": 0.82, "chunkCount": 3 },
        { "page": 3, "avgScore": 0.78, "chunkCount": 2 }
      ]
    }
  ],
  "potentialIssues": [
    "Document Wine Guide.pdf: Large page gap detected (4 to 6) - may indicate chunking issues"
  ]
}
```

### 2. Page Validation API (`/api/validate-pages`)
**Usage:** `GET /api/validate-pages?documentId=123` (or without documentId for all docs)

**What it validates:**
- Cross-references chunk page numbers with actual PDF page count
- Identifies missing pages, page gaps, and distribution issues
- Detects documents with invalid or estimated page numbers
- Provides recommendations for fixing issues

**Example issues detected:**
- "Page Overflow: Chunks reference page 150 but PDF only has 120 pages"
- "Low Coverage: Only 45.2% of PDF pages have text chunks"
- "Page Gap: Missing pages between 15 and 23"

### 3. Enhanced Citation Logging
The chat API now logs detailed citation analysis for every query:
```
API_CHAT: Citation analysis for document "Wine Guide.pdf" (ID: 123):
  - Primary page: 4 (score: 0.823)
  - All relevant pages (numerical): [3, 4, 6, 7]
  - Pages by relevance: [4(2.47), 3(1.56), 6(0.89), 7(0.72)]
  - Additional pages (relevance order): [3, 6, 7]
  - Total chunks found: 6, Avg score: 0.756
  - ⚠️  Large page gaps detected: 4-6 (gap: 2)
```

## Core Algorithm Improvements

### 1. Page-Boundary-Aware Chunking
**Problem Fixed:** Chunks were spanning multiple pages, causing incorrect page assignments.
**Solution:** Modified `/api/upload/route.ts` to:
- Process each PDF page individually before chunking
- Ensure no chunk contains text from multiple pages
- Add validation for content retention and chunk quality
- Log detailed statistics about chunk distribution per page

### 2. Smart Deduplication Logic
**Problem Fixed:** System only considered single highest-scoring chunk per document.
**Solution:** New algorithm in `/api/chat/route.ts`:
- Calculates page-level relevance scores (average × chunk count boost)
- Selects primary page based on overall page quality, not just single chunk
- Still maintains one citation per document to avoid redundancy
- Provides better representative chunks for each document

### 3. Relevance-Based Page Ordering
**Problem Fixed:** Additional pages were shown in numerical order, not relevance order.
**Solution:** Citation pages now ordered by:
1. Primary page first (highest quality page)
2. Additional pages by relevance score
3. Numerical order as tiebreaker

## Testing the Improvements

### Before Using Your App:
1. **Test the debugging API** with a question that previously gave wrong pages:
   ```bash
   curl -X POST http://localhost:3000/api/debug-citations \
     -H "Content-Type: application/json" \
     -d '{"query": "When is the optimal time to harvest grapes?"}'
   ```

2. **Validate your existing documents**:
   ```bash
   curl http://localhost:3000/api/validate-pages
   ```

### Testing Citation Accuracy:
1. Ask a question about wine harvesting (from your screenshot)
2. Check the server logs for the detailed citation analysis
3. Verify the citation pages match the actual content
4. Use the debugging API to understand why specific pages were chosen

### Expected Improvements:
- ✅ More accurate primary page selection
- ✅ Better additional page relevance ordering  
- ✅ Fewer instances of wrong pages being cited
- ✅ Better handling of multi-page content spans
- ✅ Detailed logging to understand citation decisions

## Backward Compatibility

All changes are backward compatible:
- Existing documents will work with the new system
- The UI citation display remains unchanged
- Old chunking data is still supported (though new uploads will be more accurate)

## Next Steps

1. **Test with your existing documents** using the debugging APIs
2. **Re-upload problematic PDFs** to benefit from improved chunking
3. **Monitor the enhanced logs** to identify remaining edge cases
4. **Use validation API** periodically to catch data quality issues

The improvements address the core issues you identified while providing tools to diagnose and prevent future citation accuracy problems.