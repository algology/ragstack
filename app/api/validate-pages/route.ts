import { supabase } from "@/lib/supabaseClient";
import { NextRequest } from "next/server";

interface PageValidationResult {
  documentId: number;
  documentName: string;
  filePath: string | null;
  pdfPageCount: number | null;
  chunkPageRange: { min: number; max: number };
  totalChunks: number;
  pageDistribution: { page: number; chunkCount: number }[];
  issues: string[];
  recommendations: string[];
}

interface ValidationSummary {
  totalDocuments: number;
  documentsWithIssues: number;
  totalIssues: number;
  issueTypes: { [key: string]: number };
  results: PageValidationResult[];
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const documentId = searchParams.get('documentId');

    // Get documents to validate
    let documentsQuery = supabase
      .from('documents')
      .select('id, name, file_path');

    if (documentId) {
      documentsQuery = documentsQuery.eq('id', parseInt(documentId, 10));
    }

    const { data: documents, error: docError } = await documentsQuery;
    
    if (docError) {
      throw new Error(`Failed to fetch documents: ${docError.message}`);
    }

    if (!documents || documents.length === 0) {
      return Response.json({ message: "No documents found" });
    }

    const results: PageValidationResult[] = [];
    let totalIssues = 0;
    const issueTypes: { [key: string]: number } = {};

    for (const doc of documents) {
      const result = await validateDocument(doc);
      results.push(result);
      totalIssues += result.issues.length;
      
      result.issues.forEach(issue => {
        const issueType = issue.split(':')[0];
        issueTypes[issueType] = (issueTypes[issueType] || 0) + 1;
      });
    }

    const summary: ValidationSummary = {
      totalDocuments: documents.length,
      documentsWithIssues: results.filter(r => r.issues.length > 0).length,
      totalIssues,
      issueTypes,
      results
    };

    return Response.json(summary);

  } catch (error: any) {
    console.error("Page validation error:", error);
    return Response.json(
      { error: "Failed to validate pages", details: error.message },
      { status: 500 }
    );
  }
}

async function validateDocument(doc: any): Promise<PageValidationResult> {
  const issues: string[] = [];
  const recommendations: string[] = [];

  // Get all chunks for this document
  const { data: chunks, error: chunkError } = await supabase
    .from('document_chunks')
    .select('id, page_number, content')
    .eq('document_id', doc.id)
    .order('page_number', { ascending: true });

  if (chunkError) {
    issues.push(`Database Error: Failed to fetch chunks - ${chunkError.message}`);
    return {
      documentId: doc.id,
      documentName: doc.name,
      filePath: doc.file_path,
      pdfPageCount: null,
      chunkPageRange: { min: 0, max: 0 },
      totalChunks: 0,
      pageDistribution: [],
      issues,
      recommendations
    };
  }

  const totalChunks = chunks?.length || 0;
  
  if (totalChunks === 0) {
    issues.push("No Chunks: Document has no text chunks");
    recommendations.push("Re-upload document to generate chunks");
    return {
      documentId: doc.id,
      documentName: doc.name,
      filePath: doc.file_path,
      pdfPageCount: null,
      chunkPageRange: { min: 0, max: 0 },
      totalChunks: 0,
      pageDistribution: [],
      issues,
      recommendations
    };
  }

  // Analyze page numbers in chunks
  const pageNumbers = chunks
    ?.map(chunk => chunk.page_number)
    .filter(page => page != null && page > 0) || [];

  if (pageNumbers.length === 0) {
    issues.push("Missing Page Numbers: No valid page numbers found in chunks");
    recommendations.push("Run page number backfill script or re-upload document");
  }

  const minPage = pageNumbers.length > 0 ? Math.min(...pageNumbers) : 0;
  const maxPage = pageNumbers.length > 0 ? Math.max(...pageNumbers) : 0;

  // Calculate page distribution
  const pageCountMap = new Map<number, number>();
  pageNumbers.forEach(page => {
    pageCountMap.set(page, (pageCountMap.get(page) || 0) + 1);
  });

  const pageDistribution = Array.from(pageCountMap.entries())
    .map(([page, count]) => ({ page, chunkCount: count }))
    .sort((a, b) => a.page - b.page);

  // Get PDF page count if it's a PDF file
  let pdfPageCount: number | null = null;
  if (doc.file_path && doc.file_path.endsWith('.pdf')) {
    try {
      pdfPageCount = await getPdfPageCount(doc.file_path);
    } catch (error) {
      issues.push(`PDF Access Error: Cannot read PDF file - ${error}`);
    }
  }

  // Validation checks
  
  // Check 1: Page numbers should start from 1
  if (minPage > 1) {
    issues.push(`Page Gap: First page number is ${minPage}, expected 1`);
    recommendations.push("Check if document processing missed early pages");
  }

  // Check 2: Compare with PDF page count
  if (pdfPageCount !== null) {
    if (maxPage > pdfPageCount) {
      issues.push(`Page Overflow: Chunks reference page ${maxPage} but PDF only has ${pdfPageCount} pages`);
      recommendations.push("Re-process document with correct page extraction");
    }
    
    const coveragePercent = (pageDistribution.length / pdfPageCount) * 100;
    if (coveragePercent < 50) {
      issues.push(`Low Coverage: Only ${coveragePercent.toFixed(1)}% of PDF pages have text chunks`);
      recommendations.push("Check PDF for images, complex layouts, or extraction issues");
    }
  }

  // Check 3: Look for large gaps in page sequence
  if (pageDistribution.length > 1) {
    for (let i = 1; i < pageDistribution.length; i++) {
      const currentPage = pageDistribution[i].page;
      const previousPage = pageDistribution[i - 1].page;
      const gap = currentPage - previousPage;
      
      if (gap > 3) {
        issues.push(`Page Gap: Missing pages between ${previousPage} and ${currentPage}`);
        recommendations.push("Verify these pages exist and contain extractable text");
      }
    }
  }

  // Check 4: Unusual chunk distribution
  const avgChunksPerPage = totalChunks / pageDistribution.length;
  const outlierPages = pageDistribution.filter(p => 
    p.chunkCount > avgChunksPerPage * 3 || p.chunkCount < avgChunksPerPage / 3
  );
  
  if (outlierPages.length > 0) {
    const highPages = outlierPages.filter(p => p.chunkCount > avgChunksPerPage * 2).map(p => p.page);
    const lowPages = outlierPages.filter(p => p.chunkCount < avgChunksPerPage / 2).map(p => p.page);
    
    if (highPages.length > 0) {
      issues.push(`Uneven Distribution: Pages ${highPages.join(', ')} have unusually high chunk counts`);
    }
    if (lowPages.length > 0) {
      issues.push(`Uneven Distribution: Pages ${lowPages.join(', ')} have unusually low chunk counts`);
    }
    recommendations.push("Review chunking strategy for these pages");
  }

  // Check 5: Null or zero page numbers
  const nullPageChunks = chunks?.filter(chunk => !chunk.page_number || chunk.page_number <= 0).length || 0;
  if (nullPageChunks > 0) {
    issues.push(`Invalid Pages: ${nullPageChunks} chunks have null or invalid page numbers`);
    recommendations.push("Update these chunks with correct page numbers");
  }

  return {
    documentId: doc.id,
    documentName: doc.name,
    filePath: doc.file_path,
    pdfPageCount,
    chunkPageRange: { min: minPage, max: maxPage },
    totalChunks,
    pageDistribution,
    issues,
    recommendations
  };
}

async function getPdfPageCount(filePath: string): Promise<number> {
  try {
    // Get PDF file from Supabase Storage
    const { data, error } = await supabase.storage
      .from('pdfs')
      .download(filePath);

    if (error) {
      throw new Error(`Storage error: ${error.message}`);
    }

    // Use PDF.js to count pages
    const pdfjs = await import('pdfjs-dist');
    pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
    
    const arrayBuffer = await data.arrayBuffer();
    const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
    
    return pdf.numPages;
  } catch (error) {
    throw new Error(`Failed to read PDF: ${error}`);
  }
}