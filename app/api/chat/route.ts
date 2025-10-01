import { OpenAI } from "openai";
import { GoogleGenerativeAI, Content } from "@google/generative-ai";
import { Message } from "ai";
import { supabase } from "@/lib/supabaseClient";
import { NextRequest } from "next/server";

// --- Configuration Constants ---
const OPENAI_EMBEDDING_MODEL = "text-embedding-ada-002";
const GEMINI_CHAT_MODEL = "gemini-2.5-pro";
const SIMILARITY_THRESHOLD = 0.7;
const MATCH_COUNT = 10;
// -----------------------------

export const runtime = "edge"; // Use edge runtime for Vercel AI SDK

// Initialize OpenAI client for embeddings
const openaiEmbeddings = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});


const groundingTools = [{
  googleSearch: {},
} as any];

// Initialize GoogleGenerativeAI client
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

// System prompt templates - these are correct for instructing the LLM
const getSystemPromptTemplate = (questionType: "conversational" | "specific" | "open-ended", hasImageContext: boolean = false) => {
  const responseFormatting = {
    conversational: "Keep your response brief and friendly - just a sentence or two.",
    specific: "Provide a direct, concise answer to the specific question asked. Aim for 1-2 sentences with the exact information requested.",
    "open-ended": "Provide a comprehensive explanation with relevant details. Include context, examples, and background information to fully answer the question. Use 2-4 paragraphs as needed to thoroughly address the topic."
  };

  const imageInstructions = hasImageContext ? `

IMPORTANT - IMAGE ANALYSIS: You have been provided with an analysis of an uploaded image. This image analysis contains detailed observations about what is visible in the image. You MUST discuss and reference this image analysis in your response. Start your response by describing what you observe in the image, then connect it to relevant wine knowledge from the sources below. Your response should demonstrate that you understand what the user has shown you in their image.` : '';

  return `I'm your knowledgeable wine assistant, Waine, ready to help with your questions.
I'll provide answers based on the information available to me.${imageInstructions}
This information is organised into numbered sources (e.g., [1], [2], ...).
When I use information from a specific source, I'll cite the source number(s) in square brackets, like [1] or [2, 3], right after the information. This way, you'll know exactly where it came from.

IMPORTANT: When web search is enabled and I have access to web sources (indicated by sources from domains like .com, .org, etc.), I CAN and SHOULD provide information about recent trends, current events, and real-time information from those web sources. I should NOT claim I don't have access to real-time information when web sources are available.

If I don't have the specific information you're looking for in my available sources, I'll let you know.
My goal is to be clear, helpful, and share interesting wine facts!

RESPONSE FORMATTING: ${responseFormatting[questionType]}

Please respond using Australian English spelling conventions (e.g., colour, flavour, organised, realise, centre).

Sourced Information:
{context}`;
};

const getSystemPromptTemplateWithDoc = (questionType: "conversational" | "specific" | "open-ended", hasImageContext: boolean = false) => {
  const responseFormatting = {
    conversational: "Keep your response brief and friendly - just a sentence or two.",
    specific: "Provide a direct, concise answer to the specific question asked. Aim for 1-2 sentences with the exact information requested.",
    "open-ended": "Provide a comprehensive explanation with relevant details. Include context, examples, and background information to fully answer the question. Use 2-4 paragraphs as needed to thoroughly address the topic."
  };

  const imageInstructions = hasImageContext ? `

IMPORTANT - IMAGE ANALYSIS: You have been provided with an analysis of an uploaded image. This image analysis contains detailed observations about what is visible in the image. You MUST discuss and reference this image analysis in your response. Start your response by describing what you observe in the image, then connect it to relevant information from "{documentName}" below. Your response should demonstrate that you understand what the user has shown you in their image.` : '';

  return `I'm your knowledgeable wine assistant, and I'll help you with your questions about the document "{documentName}".${imageInstructions}
I'll answer your questions about "{documentName}" using the specific details provided for it below.
These details are broken down into numbered parts (e.g., [1], [2], ...) specific to "{documentName}".
When I use information from one of these parts, I'll cite the source number(s) in square brackets, like [1] or [2, 3], right after it. This helps you see where the information came from.

IMPORTANT: When web search is enabled and I have access to web sources (indicated by sources from domains like .com, .org, etc.), I CAN and SHOULD provide information about recent trends, current events, and real-time information from those web sources. I should NOT claim I don't have access to real-time information when web sources are available.

If the information for "{documentName}" doesn't cover your question, I'll make sure to tell you.
I aim to be clear, helpful and share interesting facts about "{documentName}"!

RESPONSE FORMATTING: ${responseFormatting[questionType]}

Please respond using Australian English spelling conventions (e.g., colour, flavour, organised, realise, centre).

Information for "{documentName}":
{context}`;
};

// Define the expected request body structure
interface ChatRequestBody {
  messages: Message[];
  documentId?: string;
  documentName?: string;
  enableSearch?: boolean; // Added for search toggle
  imageContext?: string; // Added for image context
}

// Function to add citations to text based on grounding metadata
function addCitationsToText(text: string, groundingMetadata: any, ragSourceOffset: number = 0): string {
  if (!groundingMetadata.groundingSupports || !groundingMetadata.groundingChunks) {
    return text;
  }

  let modifiedText = text;

  // Sort supports by end_index in descending order to avoid shifting issues when inserting
  const sortedSupports = [...groundingMetadata.groundingSupports].sort(
    (a: any, b: any) => (b.segment?.endIndex ?? 0) - (a.segment?.endIndex ?? 0)
  );

  for (const support of sortedSupports) {
    let endIndex = support.segment?.endIndex;
    if (endIndex === undefined || !support.groundingChunkIndices?.length) {
      continue;
    }

    // Find the best insertion point - prefer end of sentence or after punctuation
    // Look ahead for sentence boundaries within a reasonable range
    const searchRange = 50;
    const searchText = modifiedText.slice(endIndex, Math.min(endIndex + searchRange, modifiedText.length));
    
    // Look for sentence-ending punctuation followed by space or end of text
    const sentenceEnd = searchText.match(/[.!?]\s|[.!?]$/);
    if (sentenceEnd && sentenceEnd.index !== undefined) {
      // Move to after the punctuation
      endIndex += sentenceEnd.index + 1;
    } else {
      // If no sentence end, look for comma, semicolon, or other natural break
      const punctuationBreak = searchText.match(/[,;:]\s/);
      if (punctuationBreak && punctuationBreak.index !== undefined && punctuationBreak.index < 20) {
        endIndex += punctuationBreak.index + 1;
      } else {
        // If no punctuation, look for space to avoid breaking words
        const nextSpace = searchText.indexOf(' ');
        if (nextSpace !== -1 && nextSpace < 15) {
          endIndex += nextSpace;
        }
      }
    }

    // Calculate the citation number based on the position in the blended sources array
    // RAG sources come first, then web sources
    const citationNumbers = support.groundingChunkIndices
      .map((index: number) => `[${index + ragSourceOffset + 1}]`)
      .filter(Boolean);

    if (citationNumbers.length > 0) {
      const citationString = citationNumbers.join("");
      modifiedText = modifiedText.slice(0, endIndex) + citationString + modifiedText.slice(endIndex);
    }
  }

  return modifiedText;
}

// Define types for RPC parameters and document chunks
interface RpcParams {
  query_embedding: number[];
  match_threshold: number;
  match_count: number;
  filter_document_id?: number;
}

interface DocumentChunk {
  id: number; // Chunk ID
  document_id: number; // Document ID  
  content: string;
  name: string; // Document name, expected by the client
  page_number?: number; // Page number where this chunk appears in the original PDF
  similarity: number; // Similarity score from vector search
  additional_pages?: number[]; // Additional pages where content was found (for multi-page references)
}

export async function POST(req: NextRequest) {
  console.log("API_CHAT: Received POST request"); // 1. Log request entry
  try {
    const {
      messages,
      documentId,
      documentName,
      enableSearch,
      imageContext,
    }: ChatRequestBody = await req.json();
    console.log("API_CHAT: Parsed request body:", {
      documentId,
      documentName,
      messagesLength: messages.length,
      enableSearch,
      hasImageContext: !!imageContext,
      imageContextLength: imageContext ? imageContext.length : 0,
      imageContextPreview: imageContext ? imageContext.substring(0, 100) + "..." : null,
    }); // 2. Log parsed body

    const lastUserMessage = messages[messages.length - 1];
    let userMessageText = "";

    if (lastUserMessage && typeof lastUserMessage.content === "string") {
      userMessageText = lastUserMessage.content;
    } else if (lastUserMessage && Array.isArray(lastUserMessage.content)) {
      // Try to find the text part in the array
      const textPart = lastUserMessage.content.find(
        (part: any) => part.type === "text" && typeof part.text === "string"
      ) as { type: "text"; text: string } | undefined;
      if (textPart) {
        userMessageText = textPart.text;
      }
    }

    // Combine user message with image context if available
    if (imageContext && userMessageText) {
      userMessageText = `${imageContext}\n\nUser question: ${userMessageText}`;
      console.log("API_CHAT: Combined message with image context");
      console.log("API_CHAT: Final userMessageText length:", userMessageText.length);
    } else if (imageContext && !userMessageText) {
      userMessageText = imageContext;
      console.log("API_CHAT: Using only image context as message");
      console.log("API_CHAT: Image-only userMessageText length:", userMessageText.length);
    } else if (!imageContext && userMessageText) {
      console.log("API_CHAT: No image context, using plain user message");
    }

    if (!userMessageText) {
      console.error(
        "API_CHAT: No user message text found or content is not a string/expected structure"
      );
      return new Response(
        JSON.stringify({ error: "No user message text found" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
    console.log(
      "API_CHAT: Final message text for embedding:",
      userMessageText.substring(0, 200) + (userMessageText.length > 200 ? "..." : "")
    ); // 3. Log user message text (truncated for readability)

    // Detect question type for response formatting
    const detectQuestionType = (query: string): "conversational" | "specific" | "open-ended" => {
      const normalizedQuery = query.toLowerCase().trim();

      // Simple greetings and conversational phrases
      const conversationalQueries = [
        "hi", "hello", "hey", "howdy", "good morning", "good afternoon", 
        "good evening", "thanks", "thank you", "bye", "goodbye", "see you",
        "ok", "okay", "how are you", "how do you do", "nice to meet you", "help"
      ];

      if (normalizedQuery.length < 3 || conversationalQueries.includes(normalizedQuery)) {
        return "conversational";
      }

      // Specific/factual questions that need short, direct answers
      const specificIndicators = [
        /^(what is|what's) (the|a) (name|price|year|date|age|alcohol content)/,
        /^(which|what) (wine|grape|vineyard|vintage|bottle)/,
        /^(is|are|was|were|does|did|can|will|would)/,
        /^(how much|how many|how old)/,
        /^(when (was|is|did|does))/,
        /^(where (is|was|can|do))/,
        /what year/,
        /\b(yes or no|true or false)\b/
      ];

      if (specificIndicators.some(pattern => pattern.test(normalizedQuery))) {
        return "specific";
      }

      // Open-ended questions that need detailed explanations
      const openEndedIndicators = [
        /^(how (to|do you|does|can|should))/,
        /^(why (is|are|do|does|should|would))/,
        /^(explain|describe|tell me about)/,
        /^(what are (the|some)|what makes)/,
        /^(help me understand|i want to know about|i'm interested in)/,
        /\b(process|method|technique|approach|difference|comparison)\b/,
        /\b(benefits|advantages|disadvantages|pros and cons)\b/
      ];

      if (openEndedIndicators.some(pattern => pattern.test(normalizedQuery))) {
        return "open-ended";
      }

      // Default classification based on length and complexity
      if (normalizedQuery.length > 20 || normalizedQuery.includes(" and ") || normalizedQuery.includes(" or ")) {
        return "open-ended";
      }

      return "specific";
    };

    // Check if the query needs RAG search (avoid searching for simple greetings/conversational queries)
    const shouldSearchRAG = (query: string, hasImageContext: boolean = false): boolean => {
      const questionType = detectQuestionType(query);
      
      // If we have image context, we should almost always search RAG unless it's a pure greeting
      if (hasImageContext) {
        const pureGreetings = ["hi", "hello", "hey", "thanks", "thank you", "bye", "goodbye"];
        const normalizedQuery = query.toLowerCase().trim();
        if (pureGreetings.includes(normalizedQuery) || normalizedQuery.length < 3) {
          return false;
        }
        return true; // Search RAG for image-based queries
      }
      
      if (questionType === "conversational") return false;

      const normalizedQuery = query.toLowerCase().trim();

      // Always search if it contains wine-related terms or technical questions
      const wineTerms = [
        "wine", "grape", "vineyard", "bottle", "vintage", "alcohol", "ferment"
      ];
      if (wineTerms.some((term) => normalizedQuery.includes(term))) return true;

      // Search for questions that seem to need factual information
      const questionWords = [
        "what", "how", "why", "when", "where", "which", "tell me", "explain", "describe"
      ];
      if (
        questionWords.some((word) => normalizedQuery.includes(word)) &&
        normalizedQuery.length > 5
      )
        return true;

      // Default to searching for longer queries
      return normalizedQuery.length > 8;
    };

    // For RAG search, use the original user query if we have image context
    // This helps focus the search on the actual question rather than the entire image analysis
    let searchQuery = userMessageText;
    if (imageContext && userMessageText.includes("User question:")) {
      const userQuestionMatch = userMessageText.match(/User question: (.+)$/);
      if (userQuestionMatch) {
        searchQuery = userQuestionMatch[1].trim();
        console.log("API_CHAT: Extracted user question for search:", searchQuery);
      }
    }

    const questionType = detectQuestionType(searchQuery);
    const needsRAGSearch = shouldSearchRAG(searchQuery, !!imageContext);
    console.log("API_CHAT: Question type:", questionType);
    console.log("API_CHAT: Needs RAG search:", needsRAGSearch);
    console.log("API_CHAT: Has image context:", !!imageContext);

    let chunks: DocumentChunk[] = [];

    if (needsRAGSearch) {
      const embeddingResponse = await openaiEmbeddings.embeddings.create({
        model: OPENAI_EMBEDDING_MODEL,
        input: searchQuery, // Use the focused search query
      });
      const queryEmbedding = embeddingResponse.data[0].embedding;
      console.log("API_CHAT: Generated query embedding"); // 4. Log embedding success

      const rpcParams: RpcParams = {
        query_embedding: queryEmbedding,
        match_threshold: SIMILARITY_THRESHOLD,
        match_count: MATCH_COUNT,
      };
      if (documentId) {
        const numericDocumentId = parseInt(documentId, 10);
        if (!isNaN(numericDocumentId)) {
          rpcParams.filter_document_id = numericDocumentId;
          console.log(
            "API_CHAT: Adding filter_document_id (numeric) to RPC params:",
            numericDocumentId
          ); // 5. Log if documentId is used
        } else {
          console.warn(
            `API_CHAT: documentId '${documentId}' is not a valid number. Skipping filter.`
          );
        }
      }

      console.log(
        "API_CHAT: Calling Supabase RPC 'match_document_chunks' with params:",
        {
          match_threshold: rpcParams.match_threshold,
          match_count: rpcParams.match_count,
          filter_document_id: rpcParams.filter_document_id,
        }
      );
      const { data: chunkData, error: matchError } = await supabase.rpc(
        "match_document_chunks",
        rpcParams
      );

      if (matchError) {
        console.error(
          "API_CHAT: Error from Supabase RPC 'match_document_chunks':",
          JSON.stringify(matchError, null, 2)
        ); // 6a. Critical log for Supabase error
        // Also log the rpcParams that caused the error
        console.error(
          "API_CHAT: RPC Params that caused error:",
          JSON.stringify(rpcParams, null, 2)
        );
        throw new Error(
          `Failed to retrieve relevant document chunks: ${matchError.message}`
        );
      }
      chunks = chunkData || [];
      console.log(
        "API_CHAT: Supabase RPC successful. Chunks count:",
        chunks?.length ?? 0
      ); // 6b. Log RPC success
    } else {
      console.log("API_CHAT: Skipping RAG search for conversational query");
    }

    // Smart deduplication: prioritize page relevance over single highest score
    // This improves citation accuracy by considering page-level content quality
    const documentPages = new Map<number, Set<number>>(); // Track all pages per document
    const documentChunkAnalysis = new Map<number, { chunks: DocumentChunk[], avgScore: number }>(); // Track all chunks per document for analysis
    const pageScoreAnalysis = new Map<number, Map<number, { chunks: DocumentChunk[], avgScore: number, totalScore: number }>>(); // Track page-level scores
    
    chunks?.forEach((chunk) => {
      const docId = chunk.document_id;
      
      // Initialize tracking structures
      if (!documentPages.has(docId)) {
        documentPages.set(docId, new Set());
        documentChunkAnalysis.set(docId, { chunks: [], avgScore: 0 });
        pageScoreAnalysis.set(docId, new Map());
      }
      
      if (chunk.page_number) {
        documentPages.get(docId)!.add(chunk.page_number);
        
        // Track page-level scores
        const docPageScores = pageScoreAnalysis.get(docId)!;
        if (!docPageScores.has(chunk.page_number)) {
          docPageScores.set(chunk.page_number, { chunks: [], avgScore: 0, totalScore: 0 });
        }
        const pageData = docPageScores.get(chunk.page_number)!;
        pageData.chunks.push(chunk);
        pageData.totalScore += chunk.similarity;
      }
      
      // Add to overall document analysis
      const analysis = documentChunkAnalysis.get(docId)!;
      analysis.chunks.push(chunk);
    });
    
    // Calculate page-level averages and select best representative chunk per document
    const uniqueDocuments = new Map<number, DocumentChunk>();
    
    pageScoreAnalysis.forEach((pageScores, docId) => {
      let bestPage: number | null = null;
      let bestPageScore = 0;
      let bestChunk: DocumentChunk | null = null;
      
      // Calculate average scores for each page
      pageScores.forEach((pageData, pageNumber) => {
        pageData.avgScore = pageData.totalScore / pageData.chunks.length;
        
        // Find the best page by considering both average score and chunk count
        // Pages with more high-quality chunks are preferred
        const pageQualityScore = pageData.avgScore * Math.min(pageData.chunks.length, 3); // Cap boost at 3 chunks
        
        if (pageQualityScore > bestPageScore) {
          bestPageScore = pageQualityScore;
          bestPage = pageNumber;
          // From the best page, select the highest scoring chunk
          bestChunk = pageData.chunks.reduce((prev, current) => 
            (current.similarity > prev.similarity) ? current : prev
          );
        }
      });
      
      if (bestChunk) {
        uniqueDocuments.set(docId, bestChunk);
        console.log(`API_CHAT: Selected primary chunk for document ID ${docId}: Page ${bestPage} (quality score: ${bestPageScore.toFixed(3)})`);
      } else {
        // Fallback to original logic if no page-based selection worked
        const analysis = documentChunkAnalysis.get(docId);
        if (analysis && analysis.chunks.length > 0) {
          const fallbackChunk = analysis.chunks.reduce((prev, current) => 
            (current.similarity > prev.similarity) ? current : prev
          );
          uniqueDocuments.set(docId, fallbackChunk);
          console.log(`API_CHAT: Fallback selection for document ID ${docId}: Single highest score ${fallbackChunk.similarity.toFixed(3)}`);
        }
      }
    });
    
    // Calculate average scores for logging
    documentChunkAnalysis.forEach((analysis) => {
      analysis.avgScore = analysis.chunks.reduce((sum, chunk) => sum + chunk.similarity, 0) / analysis.chunks.length;
    });
    
    // Add additional page information with improved relevance-based ordering
    const deduplicatedSources = Array.from(uniqueDocuments.values()).map(chunk => {
      const allPages = documentPages.get(chunk.document_id);
      const analysis = documentChunkAnalysis.get(chunk.document_id);
      const pageScores = pageScoreAnalysis.get(chunk.document_id);
      
      if (allPages && allPages.size > 1 && pageScores) {
        // Create relevance-weighted page ordering instead of just numerical order
        const pageRelevanceScores = Array.from(allPages).map(pageNum => {
          const pageData = pageScores.get(pageNum);
          return {
            page: pageNum,
            avgScore: pageData?.avgScore || 0,
            chunkCount: pageData?.chunks.length || 0,
            qualityScore: (pageData?.avgScore || 0) * Math.min(pageData?.chunks.length || 0, 3),
            isPrimary: pageNum === chunk.page_number
          };
        }).sort((a, b) => {
          // Primary page always first, then by quality score, then by page number
          if (a.isPrimary) return -1;
          if (b.isPrimary) return 1;
          if (Math.abs(a.qualityScore - b.qualityScore) > 0.05) {
            return b.qualityScore - a.qualityScore; // Higher quality first
          }
          return a.page - b.page; // Then by page order
        });
        
        // Extract additional pages (excluding primary) in relevance order
        const additionalPages = pageRelevanceScores
          .filter(p => !p.isPrimary)
          .map(p => p.page);
        
        // Enhanced logging with relevance-based analysis
        const allPagesArray = Array.from(allPages).sort((a, b) => a - b);
        const pageGaps = [];
        for (let i = 1; i < allPagesArray.length; i++) {
          const gap = allPagesArray[i] - allPagesArray[i-1];
          if (gap > 2) {
            pageGaps.push(`${allPagesArray[i-1]}-${allPagesArray[i]} (gap: ${gap})`);
          }
        }
        
        console.log(`API_CHAT: Citation analysis for document "${chunk.name}" (ID: ${chunk.document_id}):`);
        console.log(`  - Primary page: ${chunk.page_number} (score: ${chunk.similarity.toFixed(3)})`);
        console.log(`  - All relevant pages (numerical): [${allPagesArray.join(', ')}]`);
        console.log(`  - Pages by relevance: [${pageRelevanceScores.map(p => `${p.page}(${p.qualityScore.toFixed(2)})`).join(', ')}]`);
        console.log(`  - Additional pages (relevance order): [${additionalPages.join(', ')}]`);
        console.log(`  - Total chunks found: ${analysis?.chunks.length || 0}, Avg score: ${analysis?.avgScore.toFixed(3) || 'N/A'}`);
        if (pageGaps.length > 0) {
          console.log(`  - ⚠️  Large page gaps detected: ${pageGaps.join(', ')}`);
        }
        
        // Validate the new relevance-based approach
        const secondBestPage = pageRelevanceScores.find(p => !p.isPrimary);
        const primaryPageData = pageRelevanceScores.find(p => p.isPrimary);
        if (secondBestPage && primaryPageData && secondBestPage.qualityScore > primaryPageData.qualityScore) {
          console.log(`  - ℹ️  Note: Page ${secondBestPage.page} has higher quality score (${secondBestPage.qualityScore.toFixed(3)}) but primary was chosen by single-chunk rule`);
        }
        
        return {
          ...chunk,
          additional_pages: additionalPages.length > 0 ? additionalPages : undefined
        };
      } else {
        console.log(`API_CHAT: Single-page citation for document "${chunk.name}" (ID: ${chunk.document_id}):`);
        console.log(`  - Page: ${chunk.page_number} (score: ${chunk.similarity.toFixed(3)})`);
        console.log(`  - Total chunks found: ${analysis?.chunks.length || 0}, Avg score: ${analysis?.avgScore.toFixed(3) || 'N/A'}`);
      }
      return chunk;
    });
    
    const numberedContext =
      deduplicatedSources && deduplicatedSources.length > 0
        ? deduplicatedSources
            .map(
              (chunk: DocumentChunk, index: number) =>
                `[${index + 1}] ${chunk.content}`
            )
            .join("\n\n---\n\n")
        : "No relevant context found.";
    console.log(`API_CHAT: Prepared numbered context for LLM with ${deduplicatedSources.length} deduplicated sources`); // 7. Log context prep
    console.log(`API_CHAT: Multi-page references found:`, deduplicatedSources
      .filter(source => source.additional_pages && source.additional_pages.length > 0)
      .map(source => ({ 
        name: source.name, 
        primaryPage: source.page_number, 
        additionalPages: source.additional_pages 
      })));

    let promptTemplate = getSystemPromptTemplate(questionType, !!imageContext);
    if (documentName) {
      promptTemplate = getSystemPromptTemplateWithDoc(questionType, !!imageContext).replace(
        /{documentName}/g,
        documentName
      );
    }

    // Sanitize the context to remove problematic Unicode characters
    const sanitizedContext = numberedContext
      .replace(/[\u2018\u2019]/g, "'") // Replace smart quotes with regular quotes
      .replace(/[\u201C\u201D]/g, '"') // Replace smart double quotes
      .replace(/[\u2013\u2014]/g, "-") // Replace em/en dashes with regular dash
      .replace(/[\u2026]/g, "...") // Replace ellipsis with three dots
      .replace(/[^\x00-\x7F]/g, ""); // Remove any remaining non-ASCII characters

    // Also sanitize the prompt template
    const sanitizedPromptTemplate = promptTemplate
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2013\u2014]/g, "-")
      .replace(/[\u2026]/g, "...")
      .replace(/[^\x00-\x7F]/g, "");

    const formattedSystemPrompt = sanitizedPromptTemplate.replace(
      "{context}",
      sanitizedContext
    );
    console.log("API_CHAT: Prepared system prompt for LLM"); // 8. Log prompt prep

    console.log("API_CHAT: Prepared messages for Gemini"); // 9. Log Gemini messages prep

    // Prepare the complete message history for Vercel AI SDK
    const chatMessages: Message[] = messages.map((msg, index) => {
      let content = "";
      if (typeof msg.content === "string") {
        content = msg.content;
      } else if (Array.isArray(msg.content)) {
        const textPart = (
          msg.content as Array<{ type: string; text?: string }>
        ).find((part) => part.type === "text" && typeof part.text === "string");
        if (textPart && textPart.text) {
          content = textPart.text;
        }
      }

      // Sanitize message content
      const sanitizedContent = content
        .replace(/[\u2018\u2019]/g, "'")
        .replace(/[\u201C\u201D]/g, '"')
        .replace(/[\u2013\u2014]/g, "-")
        .replace(/[\u2026]/g, "...")
        .replace(/[^\x00-\x7F]/g, "");

      return {
        id: msg.id || `msg-${index}`,
        role: msg.role,
        content: sanitizedContent,
      };
    });

    console.log("API_CHAT: Using Google Generative AI directly");

    // Create Gemini model
    const model = genAI.getGenerativeModel({
      model: GEMINI_CHAT_MODEL,
      systemInstruction: formattedSystemPrompt,
    });

    // Prepare history for Gemini (excluding last message)
    const history: Content[] = chatMessages.slice(0, -1).map((msg) => ({
      role: msg.role === "user" ? "user" : "model",
      parts: [{ text: msg.content }],
    }));

    // Start chat with history
    const chat = model.startChat({
      history: history,
      tools: enableSearch ? groundingTools : undefined,
    });
    console.log("API_CHAT: Chat started with tools:", enableSearch ? groundingTools : undefined);

    // Get the current prompt (use modified userMessageText which includes image context)
    const currentPrompt = userMessageText || "Hello";
    console.log("API_CHAT: Using current prompt with image context:", currentPrompt.substring(0, 200) + "...");

    // Stream the response with error handling for search retrieval
    let result;
    try {
      console.log(`API_CHAT: Attempting to start streaming with enableSearch: ${enableSearch}`);
      console.log(`API_CHAT: Tool configuration:`, enableSearch ? groundingTools : undefined);
      result = await chat.sendMessageStream(currentPrompt);
      console.log(`API_CHAT: Successfully started streaming with search enabled: ${enableSearch}`);
    } catch (error) {
      console.error("API_CHAT: Error with Google Search:", error);
      console.error("API_CHAT: Error details:", JSON.stringify(error, Object.getOwnPropertyNames(error)));
      console.error("API_CHAT: Error message:", (error as any)?.message);
      console.error("API_CHAT: Error status:", (error as any)?.status);
      
      // Fallback: retry without search tools if search-enabled request fails
      if (enableSearch) {
        console.log("API_CHAT: Retrying without search tools...");
        const fallbackChat = model.startChat({
          history: history,
          tools: undefined,
        });
        result = await fallbackChat.sendMessageStream(currentPrompt);
        console.log("API_CHAT: Fallback without search tools successful");
      } else {
        throw error;
      }
    }

    console.log("API_CHAT: Creating proper AI SDK stream response");
    console.log(`API_CHAT: Using ${deduplicatedSources.length} deduplicated sources from ${chunks?.length || 0} total chunks`);

    // Create a proper AI SDK compatible stream
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();

        try {

          // Send initial data with deduplicated RAG sources and image usage flag
          const initialPayload = {
            ragSources: deduplicatedSources,
            imageUsed: !!imageContext
          };
          controller.enqueue(
            encoder.encode(
              `2:[${JSON.stringify(initialPayload)}]\n`
            )
          );

          let groundingMetadata: any = null;
          let fullText = "";

          // First, collect all text and metadata
          for await (const chunk of result.stream) {
            console.log("API_CHAT: Processing chunk:", JSON.stringify(chunk, null, 2));

            if (chunk.candidates && chunk.candidates[0].content?.parts) {
              for (const part of chunk.candidates[0].content.parts) {
                if (part.text) {
                  fullText += part.text;
                }
              }
            }

            // Capture grounding metadata if available
            if (chunk.candidates && chunk.candidates[0].groundingMetadata) {
              groundingMetadata = chunk.candidates[0].groundingMetadata;
              console.log(
                "API_CHAT: Captured grounding metadata:",
                JSON.stringify(groundingMetadata, null, 2)
              );
            } else if (chunk.candidates && chunk.candidates[0]) {
              console.log("API_CHAT: No grounding metadata in chunk candidate. Available keys:", Object.keys(chunk.candidates[0]));
            }
          }

          // If we have grounding metadata, add citations to the text
          if (groundingMetadata && groundingMetadata.groundingSupports) {
            // Calculate offset for web sources (RAG sources come first in blendedSources)
            const ragSourceCount = deduplicatedSources.length;
            fullText = addCitationsToText(fullText, groundingMetadata, ragSourceCount);
            console.log("API_CHAT: Added citations to text. RAG sources:", ragSourceCount, "Modified text length:", fullText.length);
          }

          // Now stream the complete text with citations
          if (fullText) {
            controller.enqueue(
              encoder.encode(`0:${JSON.stringify(fullText)}\n`)
            );
          }

          // Send final payload with both RAG sources and grounding metadata
          if (groundingMetadata) {
            const finalPayload = {
              ragSources: deduplicatedSources,
              groundingMetadata: groundingMetadata,
              imageUsed: !!imageContext
            };
            controller.enqueue(
              encoder.encode(
                `2:[${JSON.stringify(finalPayload)}]\n`
              )
            );
            console.log("API_CHAT: Sent final payload with grounding metadata");
          }

          controller.close();
        } catch (error) {
          console.error("Stream error:", error);
          controller.error(error);
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "X-Experimental-Stream-Data": "true",
      },
    });
  } catch (error: any) {
    console.error("API_CHAT: Unhandled error in POST function:", error); // 17. Log any other unhandled error
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({
        error: "Failed to process chat message",
        details: errorMessage,
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
