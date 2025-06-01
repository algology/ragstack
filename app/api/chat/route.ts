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

// Initialize OpenAI client for embeddings (can use Vercel's adapter too if preferred)
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
If I don't have the specific information you're looking for, I'll let you know.
My goal is to be clear, helpful, and share interesting wine facts!

Please respond using Australian English spelling conventions (e.g., colour, flavour, organised, realise, centre).

Sourced Information:
{context}`;

const SYSTEM_PROMPT_TEMPLATE_WITH_DOC = `I'm your knowledgeable wine assistant, and I'll help you with your questions about the document "{documentName}".
I'll answer your questions about "{documentName}" using the specific details provided for it below.
These details are broken down into numbered parts (e.g., [1], [2], ...) specific to "{documentName}".
When I use information from one of these parts, I'll cite the source number(s) in square brackets, like [1] or [2, 3], right after it. This helps you see where the information came from.
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
  id: number; // Assuming ID is a number; or string if more appropriate
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

    // Construct history for Gemini
    const history: Content[] = messages
      .filter(
        (msg): msg is Message & { role: "user" | "assistant" } =>
          msg.role === "user" || msg.role === "assistant"
      )
      .map((msg) => {
        let text = "";
        if (typeof msg.content === "string") {
          text = msg.content;
        } else if (Array.isArray(msg.content)) {
          // Ensure msg.content is treated as an array of parts with a text property
          const textPart = (
            msg.content as Array<{ type: string; text?: string }>
          ).find(
            (part) => part.type === "text" && typeof part.text === "string"
          );
          if (textPart && textPart.text) {
            text = textPart.text;
          }
        }
        return {
          role: msg.role === "user" ? "user" : "model", // Gemini uses "model" for assistant
          parts: [{ text }],
        };
      })
      .slice(0, -1); // Remove the last user message, it will be the new prompt

    // The last user message is the current prompt
    const currentMessage = messages[messages.length - 1];
    let currentPrompt = "";
    if (typeof currentMessage.content === "string") {
      currentPrompt = currentMessage.content;
    } else if (Array.isArray(currentMessage.content)) {
      const textPart = (
        currentMessage.content as Array<{ type: string; text?: string }>
      ).find((part) => part.type === "text" && typeof part.text === "string");
      if (textPart && textPart.text) {
        currentPrompt = textPart.text;
      }
    }

    console.log("API_CHAT: Prepared messages for Gemini"); // 9. Log Gemini messages prep

    const model = genAI.getGenerativeModel({
      model: GEMINI_CHAT_MODEL,
      systemInstruction: formattedSystemPrompt,
      // Tools are configured in startChat for Gemini 1.5 models with googleSearchRetrieval
    });

    const chat = model.startChat({
      history: history,
      tools: enableSearch ? [{ googleSearchRetrieval: {} }] : undefined,
      generationConfig: {
        // temperature: 0.9, // Example: Adjust temperature if needed
        // topK: 1, // Example: Adjust topK if needed
        // topP: 1, // Example: Adjust topP if needed
        // maxOutputTokens: 2048, // Example: Adjust max output tokens if needed
      },
    });

    const result = await chat.sendMessageStream(currentPrompt);

    console.log("API_CHAT: Received Gemini stream response object"); // 10. Log Gemini response received

    // Convert Gemini stream to Vercel AI SDK stream
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();

        // streamDataPayload will now be the RAG chunks array directly for simplicity
        const ragSourcesPayload: DocumentChunk[] = chunks || [];
        let groundingMetadataToAttachLater: any | undefined = undefined; // We'll capture but not send with 2: for now

        let initialDataSent = false;

        for await (const geminiResponseChunk of result.stream) {
          // Capture grounding metadata if available and search is enabled
          if (
            enableSearch &&
            geminiResponseChunk.candidates &&
            geminiResponseChunk.candidates[0] &&
            geminiResponseChunk.candidates[0].groundingMetadata &&
            !groundingMetadataToAttachLater // Only capture once
          ) {
            groundingMetadataToAttachLater =
              geminiResponseChunk.candidates[0].groundingMetadata;
            console.log(
              "API_CHAT: Captured grounding metadata (will be processed differently/later for this test)."
            );
          }

          // Send initial RAG sources payload before the first text chunk
          if (!initialDataSent) {
            // For this test, only send ragSourcesPayload directly
            const initialDataMessage = `2:${JSON.stringify(
              ragSourcesPayload
            )}\n`;
            controller.enqueue(encoder.encode(initialDataMessage));
            initialDataSent = true;
            console.log(
              "API_CHAT: Enqueued initial RAG sources data (array form):",
              ragSourcesPayload
            );
            // Note: groundingMetadataToAttachLater is captured but not sent in this simplified 2: prefix data
          }

          // Send the text content of the chunk
          const chunkText = geminiResponseChunk.text();
          if (chunkText) {
            const formattedTextChunk = `0:${JSON.stringify(chunkText)}\n`;
            controller.enqueue(encoder.encode(formattedTextChunk));
          }
        }

        // Fallback: If the stream ended, no text was ever sent, but we have RAG data and it wasn't sent.
        if (!initialDataSent && ragSourcesPayload.length > 0) {
          const fallbackDataMessage = `2:${JSON.stringify(
            ragSourcesPayload
          )}\n`;
          controller.enqueue(encoder.encode(fallbackDataMessage));
          console.log(
            "API_CHAT: Enqueued RAG data (array form) as a fallback:",
            ragSourcesPayload
          );
        }

        // TODO: If groundingMetadataToAttachLater was captured, consider how to send it.
        // For Vercel AI SDK, multiple distinct `2:` prefixed objects become an array in `unstable_data`.
        // Or, it might need to be a separate named stream if the SDK supports that explicitly.
        // For now, this test focuses on getting RAG citations (via simple array in 2: prefix) working.

        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "X-Experimental-Stream-Data": "true", // Crucial for Vercel AI SDK to process prefixed data
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
