import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: documentId } = await params;

  console.log("PDF Content API: Request for document ID:", documentId);

  if (!documentId || isNaN(parseInt(documentId))) {
    console.log("PDF Content API: Invalid document ID");
    return NextResponse.json({ error: "Invalid document ID" }, { status: 400 });
  }

  const docId = parseInt(documentId);

  try {
    // Get document info including file path
    console.log("PDF Content API: Fetching document from database");
    const { data: document, error: documentError } = await supabase
      .from("documents")
      .select("id, name, file_path")
      .eq("id", docId)
      .single();

    console.log("PDF Content API: Database response:", { document, documentError });

    if (documentError || !document) {
      console.log("PDF Content API: Document not found");
      return NextResponse.json(
        { error: "Document not found" },
        { status: 404 }
      );
    }

    // If we have a PDF file stored, serve it
    if (document.file_path) {
      console.log("PDF Content API: Attempting to serve PDF file:", document.file_path);
      try {
        // First, check if the file exists
        console.log("PDF Content API: Checking if file exists in Supabase Storage");
        const { data: listData, error: listError } = await supabase.storage
          .from('pdfs')
          .list('', { 
            limit: 1000,
            search: document.file_path 
          });
        
        if (listError) {
          console.error("PDF Content API: Error listing files in Supabase Storage:", listError);
          throw new Error(`Storage list error: ${listError.message}`);
        }
        
        const fileExists = listData?.some(file => file.name === document.file_path);
        if (!fileExists) {
          console.warn("PDF Content API: File does not exist in storage, falling back to text content");
          throw new Error(`File not found in storage: ${document.file_path}`);
        }
        
        console.log("PDF Content API: File exists, downloading...");
        const { data: fileData, error: downloadError } = await supabase.storage
          .from('pdfs')
          .download(document.file_path);
        
        if (downloadError) {
          console.error("PDF Content API: Error downloading PDF from Supabase Storage:", downloadError);
          const errorDetails = {
            message: downloadError.message,
            statusCode: (downloadError as any).statusCode,
            error: downloadError.name,
            filePath: document.file_path
          };
          console.error("PDF Content API: Download error details:", errorDetails);
          throw new Error(`Download failed: ${downloadError.message}`);
        }
        
        if (!fileData) {
          console.error("PDF Content API: No file data returned from Supabase Storage");
          throw new Error("No file data returned from storage");
        }
        
        const fileBuffer = Buffer.from(await fileData.arrayBuffer());
        console.log("PDF Content API: Successfully downloaded PDF file, size:", fileBuffer.length);
        
        if (fileBuffer.length === 0) {
          console.error("PDF Content API: Downloaded file is empty");
          throw new Error("Downloaded file is empty");
        }
        
        return new NextResponse(fileBuffer, {
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `inline; filename="${document.name}"`,
            'Cache-Control': 'public, max-age=3600',
          },
        });
      } catch (fileError) {
        console.error("PDF Content API: Error reading PDF file:", fileError);
        console.error("PDF Content API: Full error object:", JSON.stringify(fileError, null, 2));
        console.log("PDF Content API: Falling back to text content due to PDF error");
        // Fall back to text content if PDF file is not available
      }
    } else {
      console.log("PDF Content API: No file_path found for document, falling back to text content");
    }

    // Fallback: Get all chunks for this document, ordered by page and creation (for text content)
    console.log("PDF Content API: Fetching text chunks for fallback");
    const { data: chunks, error: chunksError } = await supabase
      .from("document_chunks")
      .select("content, page_number")
      .eq("document_id", docId)
      .order("page_number", { ascending: true, nullsFirst: false })
      .order("id", { ascending: true });

    if (chunksError) {
      console.error("PDF Content API: Error fetching document chunks:", chunksError);
      return NextResponse.json(
        { 
          error: "Failed to fetch document content",
          details: chunksError.message,
          documentId: docId,
          documentName: document.name
        },
        { status: 500 }
      );
    }

    if (!chunks || chunks.length === 0) {
      console.warn("PDF Content API: No chunks found for document");
      return NextResponse.json(
        { 
          error: "No content found for document",
          documentId: docId,
          documentName: document.name
        },
        { status: 404 }
      );
    }

    // Combine all chunks to recreate the full document, ordered by page
    const fullContent = chunks.map(chunk => chunk.content).join("\n\n");
    console.log("PDF Content API: Returning text content for", chunks.length, "chunks, total length:", fullContent.length);
    console.log("PDF Content API: Page numbers present:", chunks.filter(c => c.page_number !== null).length, "of", chunks.length);

    return NextResponse.json({
      success: true,
      document: {
        id: document.id,
        name: document.name,
        content: fullContent,
        hasFile: !!document.file_path,
        chunkCount: chunks.length,
        hasPageNumbers: chunks.some(c => c.page_number !== null)
      },
    });
  } catch (error) {
    console.error("PDF Content API: Unexpected error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      {
        error: "Failed to fetch document content",
        details: errorMessage,
      },
      { status: 500 }
    );
  }
} 