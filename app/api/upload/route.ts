import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import { OpenAI } from "openai";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: NextRequest) {
  try {
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

    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 500,
      chunkOverlap: 50,
    });
    const chunks = await splitter.splitText(textContent);

    if (chunks.length === 0) {
      return NextResponse.json(
        { error: "Could not extract chunks from provided text content" },
        { status: 400 }
      );
    }

    const batchSize = 500;
    let allEmbeddings: number[][] = [];

    for (let i = 0; i < chunks.length; i += batchSize) {
      const batchChunks = chunks.slice(i, i + batchSize);
      console.log(
        `Processing embedding batch ${i / batchSize + 1} of ${Math.ceil(
          chunks.length / batchSize
        )} (size: ${batchChunks.length})`
      );

      const embeddingsResponse = await openai.embeddings.create({
        model: "text-embedding-ada-002",
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

    const { data: docData, error: docError } = await supabase
      .from("documents")
      .insert({ name: fileName })
      .select()
      .single();

    if (docError || !docData) {
      console.error("Error inserting document:", docError);
      throw new Error("Could not insert document");
    }
    const documentId = docData.id;

    const chunkData = chunks.map((chunk, index) => ({
      document_id: documentId,
      content: chunk,
      embedding: allEmbeddings[index],
    }));

    const supabaseBatchSize = 500;
    console.log(
      `Inserting ${chunkData.length} chunks into Supabase in batches of ${supabaseBatchSize}...`
    );
    let chunkError: any = null;

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
