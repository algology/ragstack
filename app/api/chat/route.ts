import { OpenAI } from "openai";
import Groq from "groq-sdk";
import { Message } from "ai";
import { supabase } from "@/lib/supabaseClient";
import { NextRequest } from "next/server";
import { ChatCompletionMessageParam } from "groq-sdk/resources/chat/completions";

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

export async function POST(req: NextRequest) {
  try {
    const { messages }: { messages: Message[] } = await req.json();
    const lastUserMessage = messages[messages.length - 1]?.content;

    if (!lastUserMessage) {
      return new Response(JSON.stringify({ error: "No user message found" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 1. Get embedding for the user query using OpenAI
    const embeddingResponse = await openaiEmbeddings.embeddings.create({
      model: "text-embedding-ada-002",
      input: lastUserMessage,
    });
    const queryEmbedding = embeddingResponse.data[0].embedding;

    // 2. Find relevant document chunks in Supabase
    const { data: chunks, error: matchError } = await supabase.rpc(
      "match_document_chunks",
      {
        query_embedding: queryEmbedding,
        match_threshold: 0.7,
        match_count: 5,
      }
    );

    if (matchError) {
      console.error("Error matching chunks:", matchError);
      throw new Error("Failed to retrieve relevant document chunks");
    }

    const context =
      chunks && chunks.length > 0
        ? chunks.map((chunk: any) => chunk.content).join("\n\n---\n\n")
        : "No relevant context found.";

    // 3. Prepare messages for Groq, ensuring correct type
    const formattedSystemPrompt = SYSTEM_PROMPT.replace("{context}", context);
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
      model: "llama-3.3-70b-versatile",
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
