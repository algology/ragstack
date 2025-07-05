import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import { readFile } from "fs/promises";
import { join } from "path";

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
        const fullPath = join(process.cwd(), document.file_path);
        console.log("PDF Content API: Full file path:", fullPath);
        const fileBuffer = await readFile(fullPath);
        
        console.log("PDF Content API: Successfully read PDF file, size:", fileBuffer.length);
        return new NextResponse(fileBuffer, {
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `inline; filename="${document.name}"`,
            'Cache-Control': 'public, max-age=3600',
          },
        });
      } catch (fileError) {
        console.error("PDF Content API: Error reading PDF file:", fileError);
        // Fall back to text content if PDF file is not available
      }
    } else {
      console.log("PDF Content API: No file_path, falling back to text content");
    }

    // Fallback: Get all chunks for this document, ordered by creation (for text content)
    console.log("PDF Content API: Fetching text chunks for fallback");
    const { data: chunks, error: chunksError } = await supabase
      .from("document_chunks")
      .select("content")
      .eq("document_id", docId)
      .order("id", { ascending: true });

    if (chunksError) {
      console.error("PDF Content API: Error fetching document chunks:", chunksError);
      return NextResponse.json(
        { error: "Failed to fetch document content" },
        { status: 500 }
      );
    }

    // Combine all chunks to recreate the full document
    const fullContent = chunks?.map(chunk => chunk.content).join("\n\n") || "";
    console.log("PDF Content API: Returning text content, length:", fullContent.length);

    return NextResponse.json({
      success: true,
      document: {
        id: document.id,
        name: document.name,
        content: fullContent,
        hasFile: !!document.file_path,
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