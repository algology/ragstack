import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";

export async function GET() {
  try {
    // Check documents table structure
    const { data: documents, error: docsError } = await supabase
      .from("documents")
      .select("*")
      .limit(5);

    if (docsError) {
      return NextResponse.json({ error: "Database error", details: docsError });
    }

    return NextResponse.json({
      success: true,
      sample_documents: documents,
      columns: documents && documents.length > 0 ? Object.keys(documents[0]) : [],
    });
  } catch (error) {
    return NextResponse.json({
      error: "Failed to check database",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
} 