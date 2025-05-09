import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import { OpenAI } from "openai";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { PostgrestError } from "@supabase/postgrest-js";

// --- Configuration Constants ---
const OPENAI_EMBEDDING_MODEL = "text-embedding-ada-002";
const CHUNK_SIZE = 500;
const CHUNK_OVERLAP = 50;
const EMBEDDING_BATCH_SIZE = 500;
const SUPABASE_INSERT_BATCH_SIZE = 500;
// -----------------------------

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: NextRequest) {
  // TODO: Get authenticated user ID (e.g., from Supabase session)
  // const { data: { user }, error: authError } = await supabase.auth.getUser();
  // if (authError || !user) { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }); }
  // const userId = user.id;

  try {
    // Expect JSON body instead of FormData
    const { fileName, textContent } = await req.json();

    if (!fileName || typeof fileName !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid fileName" },
        { status: 400 }
      );
    }
    if (!textContent || typeof textContent !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid textContent" },
        { status: 400 }
      );
    }

    // 1. Chunk the received text
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: CHUNK_SIZE,
      chunkOverlap: CHUNK_OVERLAP,
    });
    const chunks = await splitter.splitText(textContent);

    if (chunks.length === 0) {
      return NextResponse.json(
        { error: "Could not extract chunks from provided text content" },
        { status: 400 }
      );
    }

    // 2. Create embeddings in batches
    const batchSize = EMBEDDING_BATCH_SIZE;
    let allEmbeddings: number[][] = [];

    for (let i = 0; i < chunks.length; i += batchSize) {
      const batchChunks = chunks.slice(i, i + batchSize);
      console.log(
        `Processing embedding batch ${i / batchSize + 1} of ${Math.ceil(
          chunks.length / batchSize
        )} (size: ${batchChunks.length})`
      );

      const embeddingsResponse = await openai.embeddings.create({
        model: OPENAI_EMBEDDING_MODEL,
        input: batchChunks,
      });

      const batchEmbeddings = embeddingsResponse.data.map(
        (item) => item.embedding
      );
      allEmbeddings = allEmbeddings.concat(batchEmbeddings);
    }

    console.log(`Generated ${allEmbeddings.length} embeddings total.`);

    if (allEmbeddings.length !== chunks.length) {
      console.error("Mismatch after batching:", {
        chunks: chunks.length,
        embeddings: allEmbeddings.length,
      });
      throw new Error(
        "Mismatch between chunks and generated embeddings count after batching"
      );
    }

    // 3. Store in Supabase
    const { data: docData, error: docError } = await supabase
      .from("documents")
      // TODO: Add user_id when inserting
      .insert({ name: fileName /*, user_id: userId */ })
      .select()
      .single();

    if (docError || !docData) {
      console.error("Error inserting document:", docError);
      throw new Error("Could not insert document");
    }
    const documentId = docData.id;

    const chunkData = chunks.map((chunk, index) => ({
      document_id: documentId,
      // Sanitize the chunk content by removing NULL characters (\u0000)
      content: chunk.replace(/\u0000/g, ""),
      embedding: allEmbeddings[index],
      // TODO: Add user_id here as well
      // user_id: userId
    }));

    // Insert chunks and embeddings into Supabase in batches
    const supabaseBatchSize = SUPABASE_INSERT_BATCH_SIZE;
    console.log(
      `Inserting ${chunkData.length} chunks into Supabase in batches of ${supabaseBatchSize}...`
    );
    let chunkError: PostgrestError | null = null;

    for (let i = 0; i < chunkData.length; i += supabaseBatchSize) {
      const batch = chunkData.slice(i, i + supabaseBatchSize);
      console.log(
        `Inserting Supabase batch ${i / supabaseBatchSize + 1} (size: ${
          batch.length
        })`
      );
      const { error } = await supabase.from("document_chunks").insert(batch);

      if (error) {
        console.error(
          `Error inserting Supabase batch ${i / supabaseBatchSize + 1}:`,
          error
        );
        chunkError = error;
        break;
      }
    }

    if (chunkError) {
      console.error(
        "Error inserting chunks (at least one batch failed):",
        chunkError
      );
      await supabase.from("documents").delete().match({ id: documentId });
      throw new Error(
        `Could not insert all document chunks. Error: ${
          chunkError.message || "Unknown Supabase error"
        }`
      );
    }

    console.log("Successfully inserted all chunks into Supabase.");
    return NextResponse.json({ success: true, documentId: documentId });
  } catch (error) {
    console.error("Upload API error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    let details = errorMessage;
    if (
      error &&
      typeof error === "object" &&
      "status" in error &&
      "code" in error
    ) {
      details = `Status: ${error.status}, Code: ${error.code}, Message: ${errorMessage}`;
    }
    return NextResponse.json(
      { error: "Failed to process uploaded content", details: details },
      { status: 500 }
    );
  }
}
