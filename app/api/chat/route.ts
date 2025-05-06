import { OpenAI } from "openai";
import Groq from "groq-sdk";
import { Message } from "ai";
import { supabase } from "@/lib/supabaseClient";
import { NextRequest } from "next/server";
import { ChatCompletionMessageParam } from "groq-sdk/resources/chat/completions";

// --- Configuration Constants ---
const OPENAI_EMBEDDING_MODEL = "text-embedding-ada-002";
const GROQ_CHAT_MODEL = "llama-3.3-70b-versatile";
const SIMILARITY_THRESHOLD = 0.7;
const MATCH_COUNT = 5;
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

const SYSTEM_PROMPT = `You are a helpful AI assistant. You answer questions based on the context provided.
If the context does not contain the answer, state that you cannot answer the question based on the provided information.
Be concise and informative.

Context:
{context}`;

// Define the expected request body structure
interface ChatRequestBody {
  messages: Message[];
  documentId?: string;
  documentName?: string; // <-- Add documentName
}

export async function POST(req: NextRequest) {
  // TODO: Get authenticated user ID (e.g., from Supabase session)
  // const { data: { user }, error: authError } = await supabase.auth.getUser();
  // if (authError || !user) { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }); }
  // const userId = user.id;

  try {
    // Parse the request body, including the optional documentId and documentName
    const { messages, documentId, documentName }: ChatRequestBody =
      await req.json();
    const lastUserMessage = messages[messages.length - 1]?.content;

    if (!lastUserMessage) {
      return new Response(JSON.stringify({ error: "No user message found" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 1. Get embedding for the user query using OpenAI
    const embeddingResponse = await openaiEmbeddings.embeddings.create({
      model: OPENAI_EMBEDDING_MODEL,
      input: lastUserMessage,
    });
    const queryEmbedding = embeddingResponse.data[0].embedding;

    // 2. Prepare parameters for the Supabase RPC call
    const rpcParams: {
      query_embedding: number[];
      match_threshold: number;
      match_count: number;
      filter_document_id?: string; // Add optional filter parameter
      // input_user_id?: string; // Keep potential user filtering
    } = {
      query_embedding: queryEmbedding,
      match_threshold: SIMILARITY_THRESHOLD,
      match_count: MATCH_COUNT,
      // TODO: Pass user ID to the RPC function
      // input_user_id: userId
    };

    // Add the document ID filter if it was provided in the request
    if (documentId) {
      rpcParams.filter_document_id = documentId;
    }

    // Find relevant document chunks in Supabase, potentially filtered
    const { data: chunks, error: matchError } = await supabase.rpc(
      "match_document_chunks",
      rpcParams // Pass the potentially modified params object
    );

    if (matchError) {
      console.error("Error matching chunks:", matchError);
      throw new Error("Failed to retrieve relevant document chunks");
    }

    const context =
      chunks && chunks.length > 0
        ? chunks.map((chunk: any) => chunk.content).join("\n\n---\n\n")
        : "No relevant context found."; // Or: "No relevant context found in the specified document."

    // 3. Prepare messages for Groq, ensuring correct type
    // Dynamically create the system prompt based on whether a specific document is selected
    let finalSystemPrompt = SYSTEM_PROMPT; // Default prompt
    if (documentName) {
      finalSystemPrompt = `You are a helpful AI assistant. You answer questions about the document "${documentName}" based on the context provided below.
If the context does not contain the answer, state that you cannot answer the question based on the provided information about "${documentName}".
Be concise and informative.

Context specific to "${documentName}":
{context}`;
    }

    const formattedSystemPrompt = finalSystemPrompt.replace(
      "{context}",
      context
    );
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

    // 4. Call Groq API for streaming response
    const response = await groq.chat.completions.create({
      model: GROQ_CHAT_MODEL,
      stream: true,
      messages: groqMessages,
    });

    // 5. Manually construct SSE stream
    const encoder = new TextEncoder();
    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of response) {
            const content = chunk.choices[0]?.delta?.content;
            if (content) {
              // Format as SSE message: data: {chunk}
              // Vercel AI SDK expects specific format `0:"<text>"\n` for text chunks
              const formattedChunk = `0:"${JSON.stringify(content).slice(
                1,
                -1
              )}"\n`;
              controller.enqueue(encoder.encode(formattedChunk));
            }
          }
          // Optionally send finish message `0:""\n` or other stream data if needed
        } catch (error) {
          console.error("Error reading Groq stream:", error);
          // Send error information in SSE format if possible/needed
          const errorChunk = `1:"${JSON.stringify({
            error: "Stream error",
          }).slice(1, -1)}"\n`;
          controller.enqueue(encoder.encode(errorChunk));
          controller.error(error);
        } finally {
          controller.close();
        }
      },
    });

    // Return standard Response with correct headers for SSE
    return new Response(readableStream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("Chat API error:", error);
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
