import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const documentId = params.id;

  if (!documentId || isNaN(parseInt(documentId))) {
    return NextResponse.json({ error: "Invalid document ID" }, { status: 400 });
  }

  const docId = parseInt(documentId);

  try {
    // TODO: Add user authentication/authorization here to ensure the user can delete this document

    // 1. Delete all chunks associated with the document
    console.log(`Attempting to delete chunks for document ID: ${docId}`);
    const { error: chunksError } = await supabase
      .from("document_chunks")
      .delete()
      .match({ document_id: docId });

    if (chunksError) {
      console.error(
        `Error deleting chunks for document ID ${docId}:`,
        chunksError
      );
      // If chunks deletion fails, we might not want to delete the main document yet,
      // or handle this as a partial failure. For now, we'll throw an error.
      throw new Error(
        `Failed to delete document chunks: ${chunksError.message}`
      );
    }
    console.log(`Successfully deleted chunks for document ID: ${docId}`);

    // 2. Delete the document itself
    console.log(`Attempting to delete document with ID: ${docId}`);
    const { error: documentError } = await supabase
      .from("documents")
      .delete()
      .match({ id: docId });

    if (documentError) {
      console.error(`Error deleting document ID ${docId}:`, documentError);
      // If document deletion fails after chunks were deleted, this is an inconsistent state.
      // Proper error handling/rollback might be needed in a production system.
      throw new Error(`Failed to delete document: ${documentError.message}`);
    }
    console.log(`Successfully deleted document with ID: ${docId}`);

    return NextResponse.json({
      success: true,
      message: `Document ${docId} and its associated chunks deleted successfully.`,
    });
  } catch (error) {
    console.error("Error in DELETE /api/documents/[id]:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      {
        error: "Failed to delete document",
        details: errorMessage,
      },
      { status: 500 }
    );
  }
}
