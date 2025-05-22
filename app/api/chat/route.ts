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
const SYSTEM_PROMPT_TEMPLATE = `I'm your knowledgeable wine assistant, ready to help with your questions.
I'll provide answers based on the information available to me.
This information is organized into numbered sources (e.g., [1], [2], ...).
When I use information from a specific source, I'll cite the source number(s) in square brackets, like [1] or [2, 3], right after the information. This way, you'll know exactly where it came from.
If I don't have the specific information you're looking for, I'll let you know.
My goal is to be clear, helpful, and share interesting wine facts!

Sourced Information:
{context}`;

const SYSTEM_PROMPT_TEMPLATE_WITH_DOC = `I'm your knowledgeable wine assistant, and I'll help you with your questions about the document "{documentName}".
I'll answer your questions about "{documentName}" using the specific details provided for it below.
These details are broken down into numbered parts (e.g., [1], [2], ...) specific to "{documentName}".
When I use information from one of these parts, I'll cite the source number(s) in square brackets, like [1] or [2, 3], right after it. This helps you see where the information came from.
If the information for "{documentName}" doesn't cover your question, I'll make sure to tell you.
I aim to be clear, helpful, and share interesting facts about "{documentName}"!

Information for "{documentName}":
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
  filter_document_id?: number;
}

interface DocumentChunk {
  id: number; // Assuming ID is a number; or string if more appropriate
  content: string;
  name: string; // Document name, expected by the client
  // similarity: number; // This also comes from the DB, can be added if needed downstream
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
              (chunk: DocumentChunk, index: number) =>
                `[${index + 1}] ${chunk.content}`
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
        .map((msg) => {
          let contentString = "";
          if (typeof msg.content === "string") {
            contentString = msg.content;
          } else if (Array.isArray(msg.content)) {
            // Explicitly cast to an array of known possible part types if necessary,
            // or ensure Message type is specific enough.
            // For now, casting to `any[]` then checking structure, which is not ideal but might bypass TS strictness here.
            const contentArray = msg.content as any[];
            for (const part of contentArray) {
              if (
                part &&
                part.type === "text" &&
                typeof part.text === "string"
              ) {
                contentString = part.text;
                break; // Found the first text part
              }
            }
            if (!contentString) {
              console.warn(
                `API_CHAT: Assistant message content for Groq is an array but no text part found. msg.id: ${msg.id}`
              );
            }
          } else if (msg.content === null) {
            console.warn(
              `API_CHAT: Assistant message content for Groq is null. msg.id: ${msg.id}`
            );
          }

          return {
            role: msg.role as "user" | "assistant",
            content: contentString,
          };
        }),
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
