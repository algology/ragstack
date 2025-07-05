import { OpenAI } from "openai";
import { GoogleGenerativeAI, Content } from "@google/generative-ai";
import { Message } from "ai";
import { supabase } from "@/lib/supabaseClient";
import { NextRequest } from "next/server";

// --- Configuration Constants ---
const OPENAI_EMBEDDING_MODEL = "text-embedding-ada-002";
const GEMINI_CHAT_MODEL = "gemini-1.5-flash-latest";
const SIMILARITY_THRESHOLD = 0.7;
const MATCH_COUNT = 10;
// -----------------------------

export const runtime = "edge"; // Use edge runtime for Vercel AI SDK

// Initialize OpenAI client for embeddings
const openaiEmbeddings = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Initialize GoogleGenerativeAI client
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

// System prompt templates - these are correct for instructing the LLM
const SYSTEM_PROMPT_TEMPLATE = `I'm your knowledgeable wine assistant, Waine, ready to help with your questions.
I'll provide answers based on the information available to me.
This information is organised into numbered sources (e.g., [1], [2], ...).
When I use information from a specific source, I'll cite the source number(s) in square brackets, like [1] or [2, 3], right after the information. This way, you'll know exactly where it came from.

IMPORTANT: When web search is enabled and I have access to web sources (indicated by sources from domains like .com, .org, etc.), I CAN and SHOULD provide information about recent trends, current events, and real-time information from those web sources. I should NOT claim I don't have access to real-time information when web sources are available.

If I don't have the specific information you're looking for in my available sources, I'll let you know.
My goal is to be clear, helpful, and share interesting wine facts!

Please respond using Australian English spelling conventions (e.g., colour, flavour, organised, realise, centre).

Sourced Information:
{context}`;

const SYSTEM_PROMPT_TEMPLATE_WITH_DOC = `I'm your knowledgeable wine assistant, and I'll help you with your questions about the document "{documentName}".
I'll answer your questions about "{documentName}" using the specific details provided for it below.
These details are broken down into numbered parts (e.g., [1], [2], ...) specific to "{documentName}".
When I use information from one of these parts, I'll cite the source number(s) in square brackets, like [1] or [2, 3], right after it. This helps you see where the information came from.

IMPORTANT: When web search is enabled and I have access to web sources (indicated by sources from domains like .com, .org, etc.), I CAN and SHOULD provide information about recent trends, current events, and real-time information from those web sources. I should NOT claim I don't have access to real-time information when web sources are available.

If the information for "{documentName}" doesn't cover your question, I'll make sure to tell you.
I aim to be clear, helpful and share interesting facts about "{documentName}"!

Please respond using Australian English spelling conventions (e.g., colour, flavour, organised, realise, centre).

Information for "{documentName}":
{context}`;

// Define the expected request body structure
interface ChatRequestBody {
  messages: Message[];
  documentId?: string;
  documentName?: string;
  enableSearch?: boolean; // Added for search toggle
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
  // similarity: number; // This also comes from the DB, can be added if needed downstream
}

export async function POST(req: NextRequest) {
  console.log("API_CHAT: Received POST request"); // 1. Log request entry
  try {
    const {
      messages,
      documentId,
      documentName,
      enableSearch,
    }: ChatRequestBody = await req.json();
    console.log("API_CHAT: Parsed request body:", {
      documentId,
      documentName,
      messagesLength: messages.length,
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
      "API_CHAT: Last user message text for embedding:",
      userMessageText
    ); // 3. Log user message text

    // Check if the query needs RAG search (avoid searching for simple greetings/conversational queries)
    const shouldSearchRAG = (query: string): boolean => {
      const normalizedQuery = query.toLowerCase().trim();

      // Simple greetings and conversational phrases that don't need RAG
      const nonSearchQueries = [
        "hi",
        "hello",
        "hey",
        "howdy",
        "good morning",
        "good afternoon",
        "good evening",
        "thanks",
        "thank you",
        "bye",
        "goodbye",
        "see you",
        "ok",
        "okay",
        "yes",
        "no",
        "what",
        "how are you",
        "how do you do",
        "nice to meet you",
        "help",
        "?",
      ];

      // If query is too short (less than 3 chars) or matches non-search patterns
      if (normalizedQuery.length < 3) return false;
      if (nonSearchQueries.includes(normalizedQuery)) return false;
      if (nonSearchQueries.some((phrase) => normalizedQuery === phrase))
        return false;

      // Always search if it contains wine-related terms or technical questions
      const wineTerms = [
        "wine",
        "grape",
        "vineyard",
        "bottle",
        "vintage",
        "alcohol",
        "ferment",
      ];
      if (wineTerms.some((term) => normalizedQuery.includes(term))) return true;

      // Search for questions that seem to need factual information
      const questionWords = [
        "what",
        "how",
        "why",
        "when",
        "where",
        "which",
        "tell me",
        "explain",
        "describe",
      ];
      if (
        questionWords.some((word) => normalizedQuery.includes(word)) &&
        normalizedQuery.length > 5
      )
        return true;

      // Default to searching for longer queries
      return normalizedQuery.length > 8;
    };

    const needsRAGSearch = shouldSearchRAG(userMessageText);
    console.log("API_CHAT: Needs RAG search:", needsRAGSearch);

    let chunks: DocumentChunk[] = [];

    if (needsRAGSearch) {
      const embeddingResponse = await openaiEmbeddings.embeddings.create({
        model: OPENAI_EMBEDDING_MODEL,
        input: userMessageText, // Use the extracted string
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

    const numberedContext =
      chunks && chunks.length > 0
        ? chunks
            .map(
              (chunk: DocumentChunk, index: number) =>
                `[${index + 1}] ${chunk.content}`
            )
            .join("\n\n---\n\n")
        : "No relevant context found.";
    console.log("API_CHAT: Prepared numbered context for LLM"); // 7. Log context prep

    let promptTemplate = SYSTEM_PROMPT_TEMPLATE;
    if (documentName) {
      promptTemplate = SYSTEM_PROMPT_TEMPLATE_WITH_DOC.replace(
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
      tools: enableSearch ? [{ googleSearchRetrieval: {} }] : undefined,
    });

    // Get the last message as the current prompt
    const currentPrompt =
      chatMessages[chatMessages.length - 1]?.content || "Hello";

    // Stream the response
    const result = await chat.sendMessageStream(currentPrompt);

    console.log("API_CHAT: Creating proper AI SDK stream response");

    // Deduplicate chunks by document for display (but keep all chunks for LLM context)
    const uniqueDocuments = new Map<number, DocumentChunk>();
    chunks?.forEach((chunk) => {
      if (!uniqueDocuments.has(chunk.document_id)) {
        uniqueDocuments.set(chunk.document_id, chunk);
      }
    });
    const deduplicatedSources = Array.from(uniqueDocuments.values());
    console.log(`API_CHAT: Deduplicated sources from ${chunks?.length || 0} chunks to ${deduplicatedSources.length} unique documents`);

    // Create a proper AI SDK compatible stream
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();

        try {

          // Send initial data with deduplicated RAG sources
          const initialPayload = { ragSources: deduplicatedSources };
          controller.enqueue(
            encoder.encode(
              `2:[${JSON.stringify(JSON.stringify(initialPayload))}]\n`
            )
          );

          let groundingMetadata: any = null;

          // Stream the text response and capture metadata
          for await (const chunk of result.stream) {
            if (chunk.candidates && chunk.candidates[0].content?.parts) {
              for (const part of chunk.candidates[0].content.parts) {
                if (part.text) {
                  controller.enqueue(
                    encoder.encode(`0:${JSON.stringify(part.text)}\n`)
                  );
                }
              }
            }

            // Capture grounding metadata if available
            if (chunk.candidates && chunk.candidates[0].groundingMetadata) {
              groundingMetadata = chunk.candidates[0].groundingMetadata;
              console.log(
                "API_CHAT: Captured grounding metadata:",
                JSON.stringify(groundingMetadata)
              );
            }
          }

          // Send final payload with both RAG sources and grounding metadata
          if (groundingMetadata) {
            const finalPayload = {
              ragSources: deduplicatedSources,
              groundingMetadata: groundingMetadata,
            };
            controller.enqueue(
              encoder.encode(
                `2:[${JSON.stringify(JSON.stringify(finalPayload))}]\n`
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
