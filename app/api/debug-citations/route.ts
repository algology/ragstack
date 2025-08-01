import { OpenAI } from "openai";
import { supabase } from "@/lib/supabaseClient";
import { NextRequest } from "next/server";

const OPENAI_EMBEDDING_MODEL = "text-embedding-ada-002";
const SIMILARITY_THRESHOLD = 0.7;
const MATCH_COUNT = 10;

const openaiEmbeddings = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface DebugDocumentChunk {
  id: number;
  document_id: number;
  content: string;
  name: string;
  page_number?: number;
  similarity: number;
  chunk_length: number;
  content_preview: string;
}

interface DebugResponse {
  query: string;
  totalChunksFound: number;
  relevantChunks: DebugDocumentChunk[];
  deduplicatedSources: any[];
  pageAnalysis: {
    documentId: number;
    documentName: string;
    allMatchingPages: number[];
    primaryPage: number;
    additionalPages: number[];
    highestScoringChunk: {
      page: number;
      score: number;
      content_preview: string;
    };
    pageScoreDistribution: { page: number; avgScore: number; chunkCount: number }[];
  }[];
  potentialIssues: string[];
}

export async function POST(req: NextRequest) {
  try {
    const { query, documentId } = await req.json();

    if (!query || typeof query !== "string") {
      return Response.json({ error: "Query is required" }, { status: 400 });
    }

    // Generate embedding for the query
    const embeddingResponse = await openaiEmbeddings.embeddings.create({
      model: OPENAI_EMBEDDING_MODEL,
      input: query,
    });
    const queryEmbedding = embeddingResponse.data[0].embedding;

    // Search for relevant chunks
    const rpcParams = {
      query_embedding: queryEmbedding,
      match_threshold: SIMILARITY_THRESHOLD,
      match_count: MATCH_COUNT,
      ...(documentId && { filter_document_id: parseInt(documentId, 10) }),
    };

    const { data: chunks, error: matchError } = await supabase.rpc(
      "match_document_chunks",
      rpcParams
    );

    if (matchError) {
      throw new Error(`Failed to retrieve chunks: ${matchError.message}`);
    }

    // Convert to debug format with additional analysis
    const debugChunks: DebugDocumentChunk[] = (chunks || []).map((chunk: any) => ({
      ...chunk,
      chunk_length: chunk.content.length,
      content_preview: chunk.content.substring(0, 150) + (chunk.content.length > 150 ? "..." : ""),
    }));

    // Replicate the deduplication logic from chat/route.ts
    const uniqueDocuments = new Map<number, any>();
    const documentPages = new Map<number, Set<number>>();
    
    debugChunks.forEach((chunk) => {
      const docId = chunk.document_id;
      const existing = uniqueDocuments.get(docId);
      
      if (!documentPages.has(docId)) {
        documentPages.set(docId, new Set());
      }
      if (chunk.page_number) {
        documentPages.get(docId)!.add(chunk.page_number);
      }
      
      if (!existing || chunk.similarity > existing.similarity) {
        uniqueDocuments.set(docId, chunk);
      }
    });
    
    const deduplicatedSources = Array.from(uniqueDocuments.values()).map(chunk => {
      const allPages = documentPages.get(chunk.document_id);
      if (allPages && allPages.size > 1) {
        const additionalPages = Array.from(allPages)
          .filter(page => page !== chunk.page_number)
          .sort((a, b) => a - b);
        
        return {
          ...chunk,
          additional_pages: additionalPages.length > 0 ? additionalPages : undefined
        };
      }
      return chunk;
    });

    // Analyze pages per document
    const pageAnalysis = Array.from(uniqueDocuments.keys()).map(docId => {
      const docChunks = debugChunks.filter(chunk => chunk.document_id === docId);
      const docPages = Array.from(documentPages.get(docId) || []).sort((a, b) => a - b);
      const primaryChunk = uniqueDocuments.get(docId);
      
      // Calculate average score per page
      const pageScores = new Map<number, { totalScore: number; count: number }>();
      docChunks.forEach(chunk => {
        if (chunk.page_number) {
          const existing = pageScores.get(chunk.page_number) || { totalScore: 0, count: 0 };
          pageScores.set(chunk.page_number, {
            totalScore: existing.totalScore + chunk.similarity,
            count: existing.count + 1
          });
        }
      });

      const pageScoreDistribution = Array.from(pageScores.entries()).map(([page, stats]) => ({
        page,
        avgScore: stats.totalScore / stats.count,
        chunkCount: stats.count
      })).sort((a, b) => b.avgScore - a.avgScore);

      return {
        documentId: docId,
        documentName: primaryChunk?.name || "Unknown",
        allMatchingPages: docPages,
        primaryPage: primaryChunk?.page_number || 0,
        additionalPages: docPages.filter(page => page !== primaryChunk?.page_number),
        highestScoringChunk: {
          page: primaryChunk?.page_number || 0,
          score: primaryChunk?.similarity || 0,
          content_preview: primaryChunk?.content?.substring(0, 100) + "..." || ""
        },
        pageScoreDistribution
      };
    });

    // Identify potential issues
    const potentialIssues: string[] = [];
    
    pageAnalysis.forEach(analysis => {
      // Issue 1: Primary page is not the highest scoring page on average
      if (analysis.pageScoreDistribution.length > 1) {
        const highestAvgPage = analysis.pageScoreDistribution[0];
        if (highestAvgPage.page !== analysis.primaryPage) {
          potentialIssues.push(
            `Document "${analysis.documentName}": Primary page ${analysis.primaryPage} (score: ${analysis.highestScoringChunk.score.toFixed(3)}) is not the page with highest average score (page ${highestAvgPage.page}, avg: ${highestAvgPage.avgScore.toFixed(3)})`
          );
        }
      }

      // Issue 2: Large gaps in page numbers
      if (analysis.allMatchingPages.length > 1) {
        const sortedPages = [...analysis.allMatchingPages].sort((a, b) => a - b);
        for (let i = 1; i < sortedPages.length; i++) {
          const gap = sortedPages[i] - sortedPages[i-1];
          if (gap > 5) {
            potentialIssues.push(
              `Document "${analysis.documentName}": Large page gap detected (${sortedPages[i-1]} to ${sortedPages[i]}) - may indicate chunking issues`
            );
          }
        }
      }

      // Issue 3: Single chunk dominance
      const totalChunks = debugChunks.filter(c => c.document_id === analysis.documentId).length;
      if (totalChunks > 3 && analysis.pageScoreDistribution.some(p => p.chunkCount === 1)) {
        potentialIssues.push(
          `Document "${analysis.documentName}": Some pages have only 1 matching chunk while others have multiple - may indicate uneven content distribution`
        );
      }
    });

    // Issue 4: No relevant chunks found
    if (debugChunks.length === 0) {
      potentialIssues.push("No chunks found above similarity threshold - query may be too specific or documents may not contain relevant content");
    }

    const debugResponse: DebugResponse = {
      query,
      totalChunksFound: debugChunks.length,
      relevantChunks: debugChunks,
      deduplicatedSources,
      pageAnalysis,
      potentialIssues
    };

    return Response.json(debugResponse);

  } catch (error: any) {
    console.error("Debug citations error:", error);
    return Response.json(
      { error: "Failed to debug citations", details: error.message },
      { status: 500 }
    );
  }
}