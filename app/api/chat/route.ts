import { OpenAI } from "openai";
import Groq from "groq-sdk";
import { Message, StreamData } from "ai";
import { supabase } from "@/lib/supabaseClient";
import { NextRequest } from "next/server";
import { ChatCompletionMessageParam } from "groq-sdk/resources/chat/completions";

// --- Configuration Constants ---
const OPENAI_EMBEDDING_MODEL = "text-embedding-ada-002";
const GROQ_CHAT_MODEL = "llama-3.3-70b-versatile";
const SIMILARITY_THRESHOLD = 0.7;
const MATCH_COUNT = 10;
// -----------------------------

export const runtime = "edge"; // Use edge runtime for Vercel AI SDK

// Initialize OpenAI client for embeddings (can use Vercel's adapter too if preferred)
const openaiEmbeddings = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Initialize Groq client
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

// System prompt templates - these are correct for instructing the LLM
const SYSTEM_PROMPT_TEMPLATE = `You are a helpful AI assistant. You answer questions based *only* on the context provided below.
The context consists of numbered documents chunks (e.g., [1], [2], ...).
When you use information from a specific chunk to answer the question, you MUST cite the chunk number(s) in square brackets, like [1] or [2, 3], immediately after the information.
If the context does not contain the answer, state that you cannot answer the question based on the provided information.
Be concise and informative.

Context:
{context}`;

const SYSTEM_PROMPT_TEMPLATE_WITH_DOC = `You are a helpful AI assistant. You answer questions about the document "{documentName}" based *only* on the context provided below.
The context consists of numbered documents chunks (e.g., [1], [2], ...) specific to "{documentName}".
When you use information from a specific chunk to answer the question, you MUST cite the chunk number(s) in square brackets, like [1] or [2, 3], immediately after the information.
If the context does not contain the answer, state that you cannot answer the question based on the provided information about "{documentName}".
Be concise and informative.

Context specific to "{documentName}":
{context}`;

// Define the expected request body structure
interface ChatRequestBody {
  messages: Message[];
  documentId?: string;
  documentName?: string;
}

// Define types for RPC parameters and document chunks
interface RpcParams {
  query_embedding: number[];
  match_threshold: number;
  match_count: number;
  filter_document_id?: string;
}

interface DocumentChunk {
  content: string;
  // id: string; // Example: If your chunks have an ID
  // name: string; // Example: If your chunks have a name
  // You can add any other relevant properties returned by your RPC
}

export async function POST(req: NextRequest) {
  console.log("API_CHAT: Received POST request"); // 1. Log request entry
  try {
    const { messages, documentId, documentName }: ChatRequestBody =
      await req.json();
    console.log("API_CHAT: Parsed request body:", {
      documentId,
      documentName,
      messagesLength: messages.length,
    }); // 2. Log parsed body

    const lastUserMessage = messages[messages.length - 1]?.content;
    if (!lastUserMessage) {
      console.error("API_CHAT: No user message found");
      return new Response(JSON.stringify({ error: "No user message found" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    console.log("API_CHAT: Last user message:", lastUserMessage); // 3. Log user message

    const embeddingResponse = await openaiEmbeddings.embeddings.create({
      model: OPENAI_EMBEDDING_MODEL,
      input: lastUserMessage,
    });
    const queryEmbedding = embeddingResponse.data[0].embedding;
    console.log("API_CHAT: Generated query embedding"); // 4. Log embedding success

    const rpcParams: RpcParams = {
      query_embedding: queryEmbedding,
      match_threshold: SIMILARITY_THRESHOLD,
      match_count: MATCH_COUNT,
    };
    if (documentId) {
      rpcParams.filter_document_id = documentId;
      console.log(
        "API_CHAT: Adding filter_document_id to RPC params:",
        documentId
      ); // 5. Log if documentId is used
    }

    console.log(
      "API_CHAT: Calling Supabase RPC 'match_document_chunks' with params:",
      rpcParams
    );
    const { data: chunks, error: matchError } = await supabase.rpc(
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
    console.log(
      "API_CHAT: Supabase RPC successful. Chunks count:",
      chunks?.length ?? 0
    ); // 6b. Log RPC success

    const numberedContext =
      chunks && chunks.length > 0
        ? chunks
            .map(
              (chunk: DocumentChunk, index: number) => `[${index + 1}] ${chunk.content}`
            )
            .join("\n\n---\n\n")
        : "No relevant context found.";
    console.log("API_CHAT: Prepared numbered context for LLM"); // 7. Log context prep

    let promptTemplate = SYSTEM_PROMPT_TEMPLATE;
    if (documentName) {
      promptTemplate = SYSTEM_PROMPT_TEMPLATE_WITH_DOC.replace(
        "{documentName}",
        documentName
      );
    }
    const formattedSystemPrompt = promptTemplate.replace(
      "{context}",
      numberedContext
    );
    console.log("API_CHAT: Prepared system prompt for LLM"); // 8. Log prompt prep

    const groqMessages: ChatCompletionMessageParam[] = [
      { role: "system", content: formattedSystemPrompt },
      ...messages
        .filter(
          (msg): msg is Message & { role: "user" | "assistant" } =>
            msg.role === "user" || msg.role === "assistant"
        )
        .map((msg) => ({
          role: msg.role,
          content: msg.content,
        })),
    ];
    console.log("API_CHAT: Prepared messages for Groq"); // 9. Log Groq messages prep

    const groqResponse = await groq.chat.completions.create({
      model: GROQ_CHAT_MODEL,
      stream: true,
      messages: groqMessages,
    });
    console.log("API_CHAT: Received Groq stream response object"); // 10. Log Groq response received

    // --- Manual Streaming with Vercel AI SDK Data Prefix (2:) ---
    const encoder = new TextEncoder();
    const streamData = new StreamData(); // Initialize StreamData from 'ai' package

    const readableStream = new ReadableStream({
      async start(controller) {
        console.log("API_CHAT: ReadableStream started (data prefix 2:)");
        try {
          // Send the chunks data using Vercel AI SDK prefix "2:"
          // The Vercel AI SDK expects the JSON payload for prefix 2: to be an array.
          const chunksToSend = chunks ?? [];
          const initialDataChunk = `2:${JSON.stringify(chunksToSend)}\n`;
          controller.enqueue(encoder.encode(initialDataChunk));
          console.log(
            "API_CHAT: Enqueued initial data with prefix 2:",
            chunksToSend
          );

          for await (const chunk of groqResponse) {
            const content = chunk.choices[0]?.delta?.content;
            if (content) {
              // Vercel AI SDK text chunks are prefixed with `0:`
              // Ensure content is properly escaped for JSON string format.
              const formattedTextChunk = `0:"${JSON.stringify(content).slice(
                1,
                -1
              )}"\n`;
              controller.enqueue(encoder.encode(formattedTextChunk));
            }
          }
          console.log(
            "API_CHAT: Finished iterating Groq stream (data prefix 2:)"
          );
          streamData.close(); // Close the StreamData instance when done
          controller.close();
          console.log(
            "API_CHAT: ReadableStream controller closed (data prefix 2:)"
          );
        } catch (error) {
          console.error(
            "API_CHAT: Error in ReadableStream processing (data prefix 2:):",
            error
          );
          controller.error(error);
        }
      },
    });

    console.log(
      "API_CHAT: Returning new Response object with manual stream (data prefix 2:)"
    );
    return new Response(readableStream, {
      headers: {
        // The Content-Type for Vercel AI SDK streams.
        "Content-Type": "text/plain; charset=utf-8",
        // This header signals to the Vercel AI SDK client that data is being streamed.
        "X-Experimental-Stream-Data": "true",
      },
    });
  } catch (error) {
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
