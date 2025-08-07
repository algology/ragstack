"use client";

import React, { useState, useCallback, useEffect, useRef } from "react";
import 'react-pdf/dist/Page/TextLayer.css';
import { X, FileText, Loader2, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, BookOpen, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { usePDFViewer } from "@/contexts/pdf-viewer-context";

interface PDFViewerProps {
  className?: string;
}

interface SearchResult {
  pageNumber: number;
  textIndex: number;
  text: string;
  context: string;
}

interface PageTextContent {
  pageNumber: number;
  textItems: Array<{
    str: string;
    transform: number[];
    width: number;
    height: number;
  }>;
  fullText: string;
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

interface PDFViewerHeaderProps {
  searchProps?: {
    searchTerm: string;
    onSearchChange: (term: string) => void;
    currentResult: number;
    totalResults: number;
    onPreviousResult: () => void;
    onNextResult: () => void;
    isSearching: boolean;
  };
}

function PDFViewerHeader({ searchProps }: PDFViewerHeaderProps) {
  const { state, closePDFViewer } = usePDFViewer();
  const [showSearch, setShowSearch] = useState(false);

  return (
    <div className="border-b bg-muted/50">
      {/* Main header */}
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4" />
          <h3 className="text-sm font-medium truncate">
            {state.documentName || "Document"}
          </h3>
        </div>
        <div className="flex items-center gap-2">
          {searchProps && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowSearch(!showSearch)}
              className="h-8 w-8 p-0"
            >
              <Search className="h-4 w-4" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={closePDFViewer}
            className="h-8 w-8 p-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
      
      {/* Search bar */}
      {showSearch && searchProps && (
        <div className="px-4 pb-4">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search in document..."
                value={searchProps.searchTerm}
                onChange={(e) => searchProps.onSearchChange(e.target.value)}
                className="pl-8 h-9"
              />
            </div>
            {searchProps.totalResults > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {searchProps.currentResult + 1} of {searchProps.totalResults}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={searchProps.onPreviousResult}
                  disabled={searchProps.totalResults === 0}
                  className="h-8 w-8 p-0"
                >
                  <ChevronLeft className="h-3 w-3" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={searchProps.onNextResult}
                  disabled={searchProps.totalResults === 0}
                  className="h-8 w-8 p-0"
                >
                  <ChevronRight className="h-3 w-3" />
                </Button>
              </div>
            )}
            {searchProps.isSearching && (
              <Loader2 className="h-4 w-4 animate-spin" />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function PDFViewerContent({ Document, Page }: { Document: any; Page: any }) {
  const { state, navigateToCitationPage, jumpToCitationPage } = usePDFViewer();
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [scale, setScale] = useState<number>(1.0);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [contentType, setContentType] = useState<string>('');
  const [textContent, setTextContent] = useState<string>('');
  const [pdfUrl, setPdfUrl] = useState<string>('');
  const lastSyncedPageRef = useRef<number | null>(null);
  
  // Search-related state
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [currentSearchIndex, setCurrentSearchIndex] = useState<number>(0);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [pageTextCache, setPageTextCache] = useState<Map<number, PageTextContent>>(new Map());
  const pdfDocumentRef = useRef<any>(null);

  // Extract text content from a specific PDF page
  const extractPageText = useCallback(async (pageNum: number): Promise<PageTextContent | undefined> => {
    if (!pdfDocumentRef.current) return undefined;
    
    try {
      const page = await pdfDocumentRef.current.getPage(pageNum);
      const textContent = await page.getTextContent();
      
      const textItems = textContent.items.map((item: any) => ({
        str: item.str,
        transform: item.transform,
        width: item.width,
        height: item.height,
      }));
      
      const fullText = textItems.map((item: any) => item.str).join(' ');
      
      const pageTextContent: PageTextContent = {
        pageNumber: pageNum,
        textItems,
        fullText,
      };
      
      return pageTextContent;
    } catch (error) {
      console.error(`Failed to extract text from page ${pageNum}:`, error);
      return undefined;
    }
  }, []);

  // Search through all pages for the given term
  const searchInPDF = useCallback(async (term: string) => {
    if (!term.trim() || !pdfDocumentRef.current || numPages === 0) {
      setSearchResults([]);
      setCurrentSearchIndex(0);
      return;
    }

    setIsSearching(true);
    const results: SearchResult[] = [];
    
    try {
      // Search through all pages
      for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        let pageTextContent = pageTextCache.get(pageNum);
        
        if (!pageTextContent) {
          pageTextContent = await extractPageText(pageNum);
          if (pageTextContent) {
            setPageTextCache(prev => new Map(prev).set(pageNum, pageTextContent as PageTextContent));
          }
        }
        
        if (pageTextContent) {
          const searchRegex = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
          const matches = [...pageTextContent.fullText.matchAll(searchRegex)];
          
          matches.forEach((match) => {
            const matchIndex = match.index || 0;
            const contextStart = Math.max(0, matchIndex - 50);
            const contextEnd = Math.min(pageTextContent.fullText.length, matchIndex + match[0].length + 50);
            const context = pageTextContent.fullText.slice(contextStart, contextEnd);
            
            results.push({
              pageNumber: pageNum,
              textIndex: matchIndex,
              text: match[0],
              context: context,
            });
          });
        }
      }
      
      setSearchResults(results);
      setCurrentSearchIndex(0);
      
      // Navigate to first result
      if (results.length > 0) {
        setPageNumber(results[0].pageNumber);
        lastSyncedPageRef.current = results[0].pageNumber;
      }
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setIsSearching(false);
    }
  }, [numPages, pageTextCache, extractPageText]);

  // Handle search term changes with debouncing
  useEffect(() => {
    if (searchTerm.trim()) {
      const timeoutId = setTimeout(() => searchInPDF(searchTerm), 300);
      return () => clearTimeout(timeoutId);
    } else {
      setSearchResults([]);
      setCurrentSearchIndex(0);
    }
  }, [searchTerm, searchInPDF]);

  const handleSearchChange = useCallback((term: string) => {
    setSearchTerm(term);
  }, []);

  // Navigate to previous search result
  const goToPreviousResult = useCallback(() => {
    if (searchResults.length === 0) return;
    const newIndex = currentSearchIndex > 0 ? currentSearchIndex - 1 : searchResults.length - 1;
    setCurrentSearchIndex(newIndex);
    setPageNumber(searchResults[newIndex].pageNumber);
    lastSyncedPageRef.current = searchResults[newIndex].pageNumber;
  }, [searchResults, currentSearchIndex]);

  // Navigate to next search result
  const goToNextResult = useCallback(() => {
    if (searchResults.length === 0) return;
    const newIndex = currentSearchIndex < searchResults.length - 1 ? currentSearchIndex + 1 : 0;
    setCurrentSearchIndex(newIndex);
    setPageNumber(searchResults[newIndex].pageNumber);
    lastSyncedPageRef.current = searchResults[newIndex].pageNumber;
  }, [searchResults, currentSearchIndex]);

  // Custom text renderer to highlight search matches
  const customTextRenderer = useCallback(({ str }: { str: string; itemIndex: number }) => {
    if (!searchTerm || !searchResults.length) return str;
    
    const currentPageResults = searchResults.filter(result => result.pageNumber === pageNumber);
    if (currentPageResults.length === 0) return str;
    
    const currentResult = searchResults[currentSearchIndex];
    const isCurrentResultPage = currentResult && currentResult.pageNumber === pageNumber;
    
    const regex = new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = str.split(regex);
    
    return parts.map((part) => {
      const isMatch = regex.test(part);
      const isCurrent = isCurrentResultPage && part.toLowerCase() === currentResult.text.toLowerCase();
      
      if (isMatch) {
        return `<span ${isCurrent ? 'data-search-current' : 'data-search-highlight'}="true">${part}</span>`;
      }
      return part;
    }).join('');
  }, [searchTerm, searchResults, pageNumber, currentSearchIndex]);

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
    // Reset sync tracking when document changes
    lastSyncedPageRef.current = null;
    // Clear search results when switching documents
    setSearchTerm('');
    setSearchResults([]);
    setCurrentSearchIndex(0);
    setPageTextCache(new Map());
    pdfDocumentRef.current = null;
    loadContent();
  }, [loadContent]);

  const onDocumentLoadSuccess = useCallback((pdf: { numPages: number }) => {
    const numPages = pdf.numPages;
    setNumPages(numPages);
    pdfDocumentRef.current = pdf; // Store PDF document reference for text extraction
    
    // Use page number from context if provided, otherwise default to page 1
    const targetPage = state.pageNumber && state.pageNumber > 0 && state.pageNumber <= numPages 
      ? state.pageNumber 
      : 1;
    
    setPageNumber(targetPage);
    lastSyncedPageRef.current = targetPage; // Track the initial page
    setPdfError(null);
    console.log(`PDF loaded successfully with ${numPages} pages, navigating to page ${targetPage}`);
  }, [state.pageNumber]);

  // Sync local pageNumber state with context when citation navigation changes
  useEffect(() => {
    if (state.pageNumber && numPages > 0) {
      // Only update if the context page is different from what we last synced
      // and it's a valid page number
      if (state.pageNumber !== lastSyncedPageRef.current && 
          state.pageNumber > 0 && 
          state.pageNumber <= numPages) {
        console.log(`Citation navigation: updating page from ${pageNumber} to ${state.pageNumber}`);
        setPageNumber(state.pageNumber);
        lastSyncedPageRef.current = state.pageNumber;
      }
    }
  }, [state.pageNumber, numPages]); // Removed pageNumber from dependencies to prevent loop

  const onDocumentLoadError = useCallback((error: Error) => {
    console.error('PDF load error:', error);
    setPdfError('Failed to load PDF file');
  }, []);

  const changePage = useCallback((offset: number) => {
    setPageNumber(prevPageNumber => {
      const newPageNumber = Math.min(Math.max(prevPageNumber + offset, 1), numPages);
      lastSyncedPageRef.current = newPageNumber; // Track manual navigation
      return newPageNumber;
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
    // Create search props for PDF content
    const searchProps = {
      searchTerm,
      onSearchChange: handleSearchChange,
      currentResult: currentSearchIndex,
      totalResults: searchResults.length,
      onPreviousResult: goToPreviousResult,
      onNextResult: goToNextResult,
      isSearching,
    };

    return (
      <div className="flex flex-col h-full">
        <PDFViewerHeader searchProps={searchProps} />
        {/* PDF Controls */}
        {numPages > 0 && (
          <div className="p-2 border-b bg-muted/30 space-y-2">
            {/* Regular Page Navigation */}
            <div className="flex items-center justify-between">
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

            {/* Citation Navigation Controls - only show if multiple citation pages */}
            {state.citationPages.length > 1 && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BookOpen className="h-3 w-3 text-blue-600" />
                  <span className="text-xs font-medium text-blue-600">Citation Pages:</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigateToCitationPage('prev')}
                    disabled={state.currentCitationIndex <= 0}
                    className="h-6 w-6 p-0 text-blue-600 hover:bg-blue-50"
                  >
                    <ChevronLeft className="h-3 w-3" />
                  </Button>
                  <span className="text-xs text-blue-600 font-medium">
                    Page {state.citationPages[state.currentCitationIndex]} ({state.currentCitationIndex + 1} of {state.citationPages.length})
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigateToCitationPage('next')}
                    disabled={state.currentCitationIndex >= state.citationPages.length - 1}
                    className="h-6 w-6 p-0 text-blue-600 hover:bg-blue-50"
                  >
                    <ChevronRight className="h-3 w-3" />
                  </Button>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-blue-600">Jump to:</span>
                  {state.citationPages.map((page, index) => (
                    <Button
                      key={page}
                      variant={state.currentCitationIndex === index ? "default" : "outline"}
                      size="sm"
                      onClick={() => jumpToCitationPage(page)}
                      className={`h-6 px-2 text-xs ${
                        state.currentCitationIndex === index 
                          ? "bg-blue-600 text-white hover:bg-blue-700"
                          : "text-blue-600 hover:bg-blue-50"
                      }`}
                    >
                      {page}
                    </Button>
                  ))}
                </div>
              </div>
            )}
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
                renderTextLayer={true}
                renderAnnotationLayer={false}
                customTextRenderer={customTextRenderer}
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
        <PDFViewerHeader />
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
    <div className="flex flex-col h-full">
      <PDFViewerHeader />
      <div className="flex items-center justify-center flex-1">
        <div className="text-center">
          <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-sm text-muted-foreground">No content available</p>
        </div>
      </div>
    </div>
  );
} 