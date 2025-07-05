"use client";

import React, { useState, useCallback, useEffect } from "react";
import { X, FileText, Loader2, ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { usePDFViewer } from "@/contexts/pdf-viewer-context";

interface PDFViewerProps {
  className?: string;
}

// Client-only wrapper to prevent SSR issues
export function PDFViewer({ className }: PDFViewerProps) {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  if (!isClient) {
    return null;
  }

  return <ClientOnlyPDFViewer className={className} />;
}

// The actual PDF viewer component that only runs on the client
function ClientOnlyPDFViewer({ className }: PDFViewerProps) {
  const { state, closePDFViewer } = usePDFViewer();
  const [Document, setDocument] = useState<any>(null);
  const [Page, setPage] = useState<any>(null);
  const [pdfWorkerReady, setPdfWorkerReady] = useState(false);

  // Load PDF.js components and worker only on client
  useEffect(() => {
    async function loadPdfComponents() {
      try {
        const pdfjs = await import('pdfjs-dist');
        const reactPdf = await import('react-pdf');
        
        // Use local worker from public directory
        if (typeof window !== 'undefined') {
          pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
        }
        
        setDocument(() => reactPdf.Document);
        setPage(() => reactPdf.Page);
        setPdfWorkerReady(true);
        console.log('PDF.js components loaded successfully with version:', pdfjs.version);
      } catch (error) {
        console.error('Failed to load PDF components:', error);
      }
    }

    loadPdfComponents();
  }, []);

  if (!state.isOpen) {
    return null;
  }

  return (
    <div className={`flex flex-col h-full bg-background border-l ${className}`}>
      <PDFViewerHeader />
      <div className="flex-1 overflow-hidden">
        {pdfWorkerReady && Document && Page ? (
          <PDFViewerContent Document={Document} Page={Page} />
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm text-muted-foreground">Loading PDF viewer...</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PDFViewerHeader() {
  const { state, closePDFViewer } = usePDFViewer();

  return (
    <div className="flex items-center justify-between p-4 border-b bg-muted/50">
      <div className="flex items-center gap-2">
        <FileText className="h-4 w-4" />
        <h3 className="text-sm font-medium truncate">
          {state.documentName || "Document"}
        </h3>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={closePDFViewer}
        className="h-8 w-8 p-0"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}

function PDFViewerContent({ Document, Page }: { Document: any; Page: any }) {
  const { state } = usePDFViewer();
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [scale, setScale] = useState<number>(1.4);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [contentType, setContentType] = useState<string>('');
  const [textContent, setTextContent] = useState<string>('');
  const [pdfUrl, setPdfUrl] = useState<string>('');

  const loadContent = useCallback(async () => {
    if (!state.documentId) return;
    
    setLoading(true);
    setError("");
    setContentType("");
    setTextContent("");
    setPdfUrl("");
    
    try {
      console.log('PDF Viewer Content: Loading content for document ID:', state.documentId);
      
      // First, make a HEAD request to check content type
      const headResponse = await fetch(`/api/pdf-content/${state.documentId}`, {
        method: 'HEAD'
      });
      
      const responseContentType = headResponse.headers.get('content-type') || '';
      console.log('PDF Viewer Content: Content type from API:', responseContentType);
      setContentType(responseContentType);
      
      if (responseContentType.includes('application/pdf')) {
        console.log('PDF Viewer Content: Content is PDF, will load directly');
        // For PDF content, set the URL directly without trying to parse as JSON
        setPdfUrl(`/api/pdf-content/${state.documentId}`);
      } else {
        console.log('PDF Viewer Content: Content is not PDF, fetching text content');
        // For non-PDF content, fetch and parse as JSON
        const response = await fetch(`/api/pdf-content/${state.documentId}`);
        const data = await response.json();
        setTextContent(data.content || 'No content available');
      }
    } catch (error) {
      console.error('PDF Viewer Content: Error loading content:', error);
      setError('Failed to load document content');
    } finally {
      setLoading(false);
    }
  }, [state.documentId]);

  // Load content when document ID changes
  useEffect(() => {
    loadContent();
  }, [loadContent]);

  const onDocumentLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setPageNumber(1);
    setPdfError(null);
    console.log(`PDF loaded successfully with ${numPages} pages`);
  }, []);

  const onDocumentLoadError = useCallback((error: Error) => {
    console.error('PDF load error:', error);
    setPdfError('Failed to load PDF file');
  }, []);

  const changePage = useCallback((offset: number) => {
    setPageNumber(prevPageNumber => {
      const newPageNumber = prevPageNumber + offset;
      return Math.min(Math.max(newPageNumber, 1), numPages);
    });
  }, [numPages]);

  const previousPage = useCallback(() => changePage(-1), [changePage]);
  const nextPage = useCallback(() => changePage(1), [changePage]);

  const zoomIn = useCallback(() => {
    setScale(prev => Math.min(prev + 0.2, 3.0));
  }, []);

  const zoomOut = useCallback(() => {
    setScale(prev => Math.max(prev - 0.2, 0.5));
  }, []);

  if (state.isLoading || loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm text-muted-foreground">Loading document...</span>
        </div>
      </div>
    );
  }

  if (state.error || error) {
    return (
      <div className="flex items-center justify-center h-full p-4">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle className="text-destructive">Error</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{state.error || error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!state.documentId) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-sm text-muted-foreground">No document selected</p>
        </div>
      </div>
    );
  }

  // If it's a PDF file, show the PDF viewer
  if (contentType.includes('application/pdf') && pdfUrl) {
    return (
      <div className="flex flex-col h-full">
        {/* PDF Controls */}
        {numPages > 0 && (
          <div className="flex items-center justify-between p-2 border-b bg-muted/30">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={previousPage}
                disabled={pageNumber <= 1}
                className="h-8 w-8 p-0"
              >
                <ChevronLeft className="h-3 w-3" />
              </Button>
              <span className="text-sm text-muted-foreground">
                {pageNumber} / {numPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={nextPage}
                disabled={pageNumber >= numPages}
                className="h-8 w-8 p-0"
              >
                <ChevronRight className="h-3 w-3" />
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={zoomOut}
                disabled={scale <= 0.5}
                className="h-8 w-8 p-0"
              >
                <ZoomOut className="h-3 w-3" />
              </Button>
              <span className="text-sm text-muted-foreground">
                {Math.round(scale * 100)}%
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={zoomIn}
                disabled={scale >= 3.0}
                className="h-8 w-8 p-0"
              >
                <ZoomIn className="h-3 w-3" />
              </Button>
            </div>
          </div>
        )}

        <ScrollArea className="flex-1">
          <div className="flex justify-center p-4">
            <Document
              file={pdfUrl}
              onLoadSuccess={onDocumentLoadSuccess}
              onLoadError={onDocumentLoadError}
              loading={
                <div className="flex items-center justify-center h-96">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm text-muted-foreground">Loading PDF...</span>
                  </div>
                </div>
              }
              error={
                <div className="flex items-center justify-center h-96 p-4">
                  <Card className="w-full max-w-sm">
                    <CardHeader>
                      <CardTitle className="text-destructive">PDF Error</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground">
                        {pdfError || "Unable to load PDF file"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-2">
                        Try refreshing the page or contact support if this persists.
                      </p>
                    </CardContent>
                  </Card>
                </div>
              }
              noData={
                <div className="flex items-center justify-center h-96">
                  <div className="text-center">
                    <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-sm text-muted-foreground">No PDF data available</p>
                  </div>
                </div>
              }
            >
              <Page
                pageNumber={pageNumber}
                scale={scale}
                renderTextLayer={false}
                renderAnnotationLayer={false}
                loading={
                  <div className="flex items-center justify-center h-96">
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-sm text-muted-foreground">Rendering page...</span>
                    </div>
                  </div>
                }
                error={
                  <div className="flex items-center justify-center h-96 p-4">
                    <Card className="w-full max-w-sm">
                      <CardHeader>
                        <CardTitle className="text-destructive">Page Error</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-muted-foreground">
                          Failed to render PDF page {pageNumber}
                        </p>
                      </CardContent>
                    </Card>
                  </div>
                }
              />
            </Document>
          </div>
        </ScrollArea>
      </div>
    );
  }

  // If document is text-only, show text content with proper scrolling  
  if (textContent) {
    return (
      <div className="flex flex-col h-full">
        <div className="p-2 border-b bg-muted/30">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              Text Document (No PDF available)
            </span>
          </div>
        </div>
        <ScrollArea className="flex-1 p-4">
          <div className="prose prose-sm max-w-none">
            <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
              {textContent}
            </div>
          </div>
        </ScrollArea>
      </div>
    );
  }

  // Loading or no content state
  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center">
        <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <p className="text-sm text-muted-foreground">No content available</p>
      </div>
    </div>
  );
} 