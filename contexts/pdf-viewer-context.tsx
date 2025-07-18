 "use client";

import React, { createContext, useContext, useState, useCallback } from "react";

interface PDFViewerState {
  isOpen: boolean;
  documentId: number | null;
  documentName: string | null;
  content: string | null; // Keep for fallback text content
  pageNumber: number | null; // Page to navigate to when opening PDF
  isLoading: boolean;
  error: string | null;
}

interface PDFViewerContextType {
  state: PDFViewerState;
  openPDFViewer: (documentId: number, documentName: string, pageNumber?: number) => void;
  closePDFViewer: () => void;
  setContent: (content: string) => void;
  setLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
}

const PDFViewerContext = createContext<PDFViewerContextType | null>(null);

export function PDFViewerProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<PDFViewerState>({
    isOpen: false,
    documentId: null,
    documentName: null,
    content: null,
    pageNumber: null,
    isLoading: false,
    error: null,
  });

  const openPDFViewer = useCallback(async (documentId: number, documentName: string, pageNumber?: number) => {
    console.log("PDF Viewer: openPDFViewer called with:", { documentId, documentName });
    
    // For visual PDF viewer, we don't need to pre-fetch content
    // The PDF component will handle loading directly from the API
    setState({
      isOpen: true,
      documentId,
      documentName,
      content: null,
      pageNumber: pageNumber || null,
      isLoading: false, // Not pre-loading content
      error: null,
    });

    console.log("PDF Viewer: State set to open for visual PDF");

    // Optionally fetch text content as fallback (for error states)
    try {
      console.log("PDF Viewer: Checking content type for fallback");
      
      // First check if it's a PDF or text content
      const headResponse = await fetch(`/api/pdf-content/${documentId}`, {
        method: 'HEAD'
      });
      
      const contentType = headResponse.headers.get('content-type') || '';
      console.log("PDF Viewer: Content type:", contentType);
      
      // Only try to fetch text content if it's not a PDF
      if (!contentType.includes('application/pdf')) {
        console.log("PDF Viewer: Fetching text content");
        const response = await fetch(`/api/pdf-content/${documentId}`);
        const data = await response.json();

        console.log("PDF Viewer: API response:", { status: response.status, data });

        if (response.ok && data.success && data.document.content) {
          console.log("PDF Viewer: Setting fallback text content");
          setState(prev => ({
            ...prev,
            content: data.document.content,
          }));
        }
      } else {
        console.log("PDF Viewer: Skipping text content fetch for PDF file");
      }
    } catch (error) {
      console.error("PDF Viewer: Error fetching fallback content:", error);
      // Don't set error state for fallback content failure
    }
  }, []);

  const closePDFViewer = useCallback(() => {
    setState({
      isOpen: false,
      documentId: null,
      documentName: null,
      content: null,
      pageNumber: null,
      isLoading: false,
      error: null,
    });
  }, []);

  const setContent = useCallback((content: string) => {
    setState(prev => ({ ...prev, content, isLoading: false }));
  }, []);

  const setLoading = useCallback((isLoading: boolean) => {
    setState(prev => ({ ...prev, isLoading }));
  }, []);

  const setError = useCallback((error: string | null) => {
    setState(prev => ({ ...prev, error, isLoading: false }));
  }, []);

  const value = {
    state,
    openPDFViewer,
    closePDFViewer,
    setContent,
    setLoading,
    setError,
  };

  return (
    <PDFViewerContext.Provider value={value}>
      {children}
    </PDFViewerContext.Provider>
  );
}

export function usePDFViewer() {
  const context = useContext(PDFViewerContext);
  if (!context) {
    throw new Error("usePDFViewer must be used within a PDFViewerProvider");
  }
  return context;
} 