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

  console.log("Upload API: Request received");
  
  try {
    // Accept both JSON (text content) and FormData (PDF files)
    const contentType = req.headers.get('content-type');
    console.log("Upload API: Content-Type:", contentType);
    
    let fileName: string;
    let textContent: string;
    let pdfBuffer: Buffer | null = null;

    if (contentType?.includes('application/json')) {
      // Existing text-only upload
      console.log("Upload API: Processing JSON upload");
      const body = await req.json();
      fileName = body.fileName;
      textContent = body.textContent;
    } else {
      // New PDF file upload
      console.log("Upload API: Processing FormData upload");
      const formData = await req.formData();
      const file = formData.get('file') as File;
      
      if (!file) {
        console.error("Upload API: No file provided in FormData");
        return NextResponse.json(
          { error: "No file provided" },
          { status: 400 }
        );
      }

      fileName = file.name;
      textContent = formData.get('textContent') as string;
      console.log("Upload API: File details:", { fileName, fileType: file.type, hasTextContent: !!textContent });
      
      // Store PDF file data
      if (file.type === 'application/pdf') {
        console.log("Upload API: Converting PDF to buffer");
        pdfBuffer = Buffer.from(await file.arrayBuffer());
        console.log("Upload API: PDF buffer size:", pdfBuffer.length);
      }
    }

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

    // 3. Store PDF file if provided
    let filePath: string | null = null;
    if (pdfBuffer) {
      console.log("Upload API: Storing PDF file");
      // Generate unique filename
      const timestamp = Date.now();
      const safeFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
      const uniqueFileName = `${timestamp}_${safeFileName}`;
      console.log("Upload API: Generated unique filename:", uniqueFileName);
      
      // Upload to Supabase Storage
      console.log("Upload API: Uploading to Supabase Storage...");
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('pdfs')
        .upload(uniqueFileName, pdfBuffer, {
          contentType: 'application/pdf',
          upsert: false
        });

      if (uploadError) {
        console.error('Upload API: Error uploading PDF to Supabase Storage:', uploadError);
        throw new Error(`Failed to upload PDF: ${uploadError.message}`);
      }

      filePath = uploadData.path;
      console.log(`Upload API: Successfully uploaded PDF to Supabase Storage: ${filePath}`);
    }

    // 4. Store in Supabase
    console.log("Upload API: Inserting document into database");
    const { data: docData, error: docError } = await supabase
      .from("documents")
      // TODO: Add user_id when inserting
      .insert({ 
        name: fileName,
        file_path: filePath
        /*, user_id: userId */ 
      })
      .select()
      .single();

    if (docError || !docData) {
      console.error("Upload API: Error inserting document:", docError);
      throw new Error(`Could not insert document: ${docError?.message || 'Unknown error'}`);
    }
    const documentId = docData.id;
    console.log("Upload API: Document inserted with ID:", documentId);

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
      `Upload API: Inserting ${chunkData.length} chunks into Supabase in batches of ${supabaseBatchSize}...`
    );
    let chunkError: PostgrestError | null = null;

    for (let i = 0; i < chunkData.length; i += supabaseBatchSize) {
      const batch = chunkData.slice(i, i + supabaseBatchSize);
      console.log(
        `Upload API: Inserting Supabase batch ${i / supabaseBatchSize + 1} (size: ${
          batch.length
        })`
      );
      const { error } = await supabase.from("document_chunks").insert(batch);

      if (error) {
        console.error(
          `Upload API: Error inserting Supabase batch ${i / supabaseBatchSize + 1}:`,
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

    console.log("Upload API: Successfully inserted all chunks into Supabase.");
    console.log("Upload API: Upload completed successfully, document ID:", documentId);
    return NextResponse.json({ success: true, documentId: documentId });
  } catch (error) {
    console.error("Upload API: Caught error:", error);
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
    console.error("Upload API: Returning error response:", { error: "Failed to process uploaded content", details });
    return NextResponse.json(
      { error: "Failed to process uploaded content", details: details },
      { status: 500 }
    );
  }
}
