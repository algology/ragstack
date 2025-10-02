"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  File,
  FileText,
  Trash2,
  ThumbsUp,
  ThumbsDown,
  MessageSquare,
  TrendingUp,
  BarChart3,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { UploadDropzone } from "@/components/upload-dropzone";
import { ModeToggle } from "@/components/mode-toggle";
import { PromptManager } from "@/components/admin/prompt-manager";
import { supabase } from "@/lib/supabaseClient";
import Link from "next/link";
import Image from "next/image";

interface UploadedDocument {
  id: number;
  name: string;
}

interface FeedbackStats {
  totalFeedback: number;
  thumbsUp: number;
  thumbsDown: number;
  positiveRate: number;
  dailyBreakdown: Array<{
    date: string;
    thumbsUp: number;
    thumbsDown: number;
    total: number;
    contextType: string;
  }>;
}

interface FeedbackRecord {
  id: number;
  conversation_id: string;
  feedback_type: 'thumbs_up' | 'thumbs_down';
  created_at: string;
  user_question?: string;
  ai_response?: string;
  message_content?: string; // Keep for backward compatibility
  context_info: {
    hasRAGSources?: boolean;
    hasWebSearch?: boolean;
    ragSources?: Array<{
      documentId?: string;
      documentName?: string;
      pageNumber?: number;
    }>;
  };
}

export default function AdminPage() {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string>("");
  const [uploadedDocuments, setUploadedDocuments] = useState<
    UploadedDocument[]
  >([]);
  const [fetchError, setFetchError] = useState<string | null>(null);
  
  // Feedback analytics state
  const [feedbackStats, setFeedbackStats] = useState<FeedbackStats | null>(null);
  const [recentFeedback, setRecentFeedback] = useState<FeedbackRecord[]>([]);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  const fetchDocuments = useCallback(async () => {
    setFetchError(null);
    console.log("Fetching documents for admin page...");
    const { data, error } = await supabase
      .from("documents")
      .select("id, name")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching documents:", error);
      setFetchError("Could not load document list.");
    } else if (data) {
      console.log("Fetched documents:", data);
      setUploadedDocuments(data);
    }
  }, []);

  const loadFeedbackAnalytics = useCallback(async () => {
    setAnalyticsLoading(true);
    setAnalyticsError(null);
    
    try {
      // Fetch analytics data with timeout
      const analyticsController = new AbortController();
      const analyticsTimeout = setTimeout(() => analyticsController.abort(), 10000); // 10 second timeout
      
      const analyticsResponse = await fetch('/api/feedback?analytics=true', {
        signal: analyticsController.signal
      });
      clearTimeout(analyticsTimeout);
      
      if (!analyticsResponse.ok) {
        const errorData = await analyticsResponse.json().catch(() => ({}));
        throw new Error(errorData.error || `Server error: ${analyticsResponse.status}`);
      }
      
      const analyticsData = await analyticsResponse.json();
      
      // Validate analytics data structure
      if (!analyticsData.stats || typeof analyticsData.stats !== 'object') {
        throw new Error('Invalid analytics data format');
      }
      
      const stats = analyticsData.stats;
      if (typeof stats.totalFeedback !== 'number' || 
          typeof stats.thumbsUp !== 'number' || 
          typeof stats.thumbsDown !== 'number' ||
          typeof stats.positiveRate !== 'number') {
        throw new Error('Invalid statistics data format');
      }
      
      // Fetch recent feedback with timeout
      const feedbackController = new AbortController();
      const feedbackTimeout = setTimeout(() => feedbackController.abort(), 10000);
      
      const feedbackResponse = await fetch('/api/feedback?recent=10', {
        signal: feedbackController.signal
      });
      clearTimeout(feedbackTimeout);
      
      if (!feedbackResponse.ok) {
        const errorData = await feedbackResponse.json().catch(() => ({}));
        throw new Error(errorData.error || `Server error: ${feedbackResponse.status}`);
      }
      
      const feedbackData = await feedbackResponse.json();
      
      // Validate feedback data structure
      if (!Array.isArray(feedbackData.feedback)) {
        console.warn('Invalid feedback data format, using empty array');
        feedbackData.feedback = [];
      }
      
      // Validate each feedback item
      const validatedFeedback = feedbackData.feedback.filter((item: any) => {
        return item && 
               typeof item.id === 'number' && 
               typeof item.conversation_id === 'string' &&
               ['thumbs_up', 'thumbs_down'].includes(item.feedback_type) &&
               typeof item.created_at === 'string';
      });
      
      setFeedbackStats(stats);
      setRecentFeedback(validatedFeedback);
      
      console.log('Admin: Successfully loaded analytics data', {
        totalFeedback: stats.totalFeedback,
        recentFeedbackCount: validatedFeedback.length
      });
      
    } catch (err) {
      console.error('Admin: Failed to load analytics data:', err);
      
      if (err instanceof Error) {
        if (err.name === 'AbortError') {
          setAnalyticsError('Request timed out. Please try again.');
        } else if (err.message.includes('NetworkError') || err.message.includes('fetch')) {
          setAnalyticsError('Network error. Please check your connection and try again.');
        } else {
          setAnalyticsError(err.message);
        }
      } else {
        setAnalyticsError('An unexpected error occurred. Please try again.');
      }
    } finally {
      setAnalyticsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) {
        console.warn('Invalid date string:', dateString);
        return 'Invalid Date';
      }
      return date.toLocaleDateString();
    } catch (error) {
      console.warn('Error formatting date:', dateString, error);
      return 'Invalid Date';
    }
  };

  const formatTime = (dateString: string) => {
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) {
        console.warn('Invalid time string:', dateString);
        return 'Invalid Time';
      }
      return date.toLocaleTimeString();
    } catch (error) {
      console.warn('Error formatting time:', dateString, error);
      return 'Invalid Time';
    }
  };

  const safePercentage = (numerator: number, denominator: number): number => {
    if (denominator === 0 || !isFinite(denominator) || !isFinite(numerator)) {
      return 0;
    }
    const result = Math.round((numerator / denominator) * 100);
    return isFinite(result) ? result : 0;
  };

  const getContextBadge = (contextInfo: FeedbackRecord['context_info']) => {
    if (contextInfo?.hasRAGSources) {
      return <Badge variant="secondary">RAG</Badge>;
    }
    if (contextInfo?.hasWebSearch) {
      return <Badge variant="outline">Web</Badge>;
    }
    return <Badge variant="secondary">General</Badge>;
  };

  const truncateText = (text: string, maxLength: number = 100): string => {
    if (!text || text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };

  const toggleRowExpansion = (feedbackId: number) => {
    setExpandedRows(prev => {
      const newSet = new Set(prev);
      if (newSet.has(feedbackId)) {
        newSet.delete(feedbackId);
      } else {
        newSet.add(feedbackId);
      }
      return newSet;
    });
  };

  const getDisplayText = (feedback: FeedbackRecord, field: 'question' | 'answer'): string => {
    if (field === 'question') {
      return feedback.user_question || 'No question recorded';
    } else {
      return feedback.ai_response || feedback.message_content || 'No response recorded';
    }
  };

  const toggleAnalytics = () => {
    setShowAnalytics(!showAnalytics);
    if (!showAnalytics && !feedbackStats) {
      loadFeedbackAnalytics();
    }
  };

  // Check database health
  const checkDatabaseHealth = useCallback(async () => {
    try {
      // Quick health check - try to fetch a small amount of data
      const response = await fetch('/api/feedback?recent=1');
      if (!response.ok) {
        console.warn('Database health check failed:', response.status);
        return false;
      }
      const data = await response.json();
      return Array.isArray(data.feedback);
    } catch (error) {
      console.warn('Database health check error:', error);
      return false;
    }
  }, []);

  const handleFileSelected = useCallback((files: File[]) => {
    setSelectedFiles(files);
    setUploadStatus("");
    console.log("Files selected for upload:", files.map(f => f.name));
  }, []);

  // Enhanced interface for page-aware text extraction
  interface PageTextChunk {
    text: string;
    pageNumber: number;
  }


  const extractTextWithPageNumbers = async (file: File): Promise<PageTextChunk[]> => {
    if (file.type === "application/pdf") {
      const pdfjsLib = await import("pdfjs-dist");
      pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const pageChunks: PageTextChunk[] = [];
      
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText =
          textContent.items
            ?.map((item) => ("str" in item ? item.str : ""))
            .join(" \n") ?? "";
        
        if (pageText.trim()) {
          pageChunks.push({
            text: pageText,
            pageNumber: i
          });
        }
      }
      return pageChunks;
    } else if (file.type === "text/plain") {
      const text = await file.text();
      return [{ text, pageNumber: 1 }]; // Text files are treated as single page
    } else {
      throw new Error("Unsupported file type passed to extraction.");
    }
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0) {
      setUploadStatus("Please select files first.");
      return;
    }

    setIsUploading(true);
    setUploadStatus(`Processing ${selectedFiles.length} files...`);

    let successCount = 0;
    let failureCount = 0;
    const newDocuments: UploadedDocument[] = [];

    try {
      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        const fileName = file.name;
        
        setUploadStatus(`Processing file ${i + 1} of ${selectedFiles.length}: ${fileName}...`);

        try {
          // Extract text with page number information
          const pageChunks = await extractTextWithPageNumbers(file);

          if (pageChunks.length === 0) {
            throw new Error("Could not extract text from file.");
          }

          setUploadStatus(`Uploading ${fileName} (${i + 1} of ${selectedFiles.length})...`);

          // Create FormData to send file, text content, and page information
          if (file.type === "application/pdf") {
            const formData = new FormData();
            formData.append("file", file);
            formData.append("pageChunks", JSON.stringify(pageChunks));

            const response = await fetch("/api/upload", {
              method: "POST",
              body: formData, // Send as FormData for PDF files
            });

            const result = await response.json();

            if (response.ok && result.success) {
              successCount++;
              newDocuments.push({ id: result.documentId, name: fileName });
            } else {
              failureCount++;
              console.error(`Upload failed for ${fileName}:`, result);
            }
          } else {
            // For text files, use JSON upload with page chunks
            const response = await fetch("/api/upload", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ 
                fileName: fileName, 
                pageChunks: pageChunks 
              }),
            });

            const result = await response.json();

            if (response.ok && result.success) {
              successCount++;
              newDocuments.push({ id: result.documentId, name: fileName });
            } else {
              failureCount++;
              console.error(`Upload failed for ${fileName}:`, result);
            }
          }
        } catch (error) {
          failureCount++;
          console.error(`Processing/Upload error for ${fileName}:`, error);
        }
      }

      // Update the document list with successful uploads
      if (newDocuments.length > 0) {
        setUploadedDocuments((prevDocs) => [...newDocuments, ...prevDocs]);
      }

      // Set final status
      if (successCount === selectedFiles.length) {
        setUploadStatus(`Successfully uploaded all ${successCount} files.`);
      } else if (successCount > 0) {
        setUploadStatus(`Uploaded ${successCount} of ${selectedFiles.length} files. ${failureCount} failed.`);
      } else {
        setUploadStatus(`Failed to upload any files. ${failureCount} errors occurred.`);
      }

      setSelectedFiles([]); // Clear selected files after upload attempt
    } catch (error) {
      console.error("Bulk upload error:", error);
      setUploadStatus(
        `Error during bulk upload: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteDocument = async (docId: number, docName: string) => {
    if (
      !window.confirm(
        `Are you sure you want to delete "${docName}"? This action cannot be undone.`
      )
    ) {
      return;
    }

    setUploadStatus(`Deleting ${docName}...`);
    try {
      const response = await fetch(`/api/documents/${docId}`, {
        method: "DELETE",
      });
      const result = await response.json();

      if (response.ok && result.success) {
        setUploadStatus(`Successfully deleted ${docName}.`);
        setUploadedDocuments((prevDocs) =>
          prevDocs.filter((doc) => doc.id !== docId)
        );
      } else {
        setUploadStatus(
          `Failed to delete ${docName}: ${result.error || "Unknown error"}`
        );
        console.error("Delete failed:", result);
      }
    } catch (error) {
      console.error("Delete document error:", error);
      setUploadStatus(
        `Error deleting ${docName}: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  };

  return (
    <div className="flex flex-col h-screen bg-background text-foreground">
      <header className="p-4 border-b flex justify-between items-center">
        <div className="flex-grow flex justify-start">
          <Link href="/" passHref>
            <Image src="/logo.png" alt="Vinea Logo" width={110} height={50} />
          </Link>
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant={showAnalytics ? "default" : "outline"}
            onClick={toggleAnalytics}
          >
            <BarChart3 className="w-4 h-4 mr-2" />
            {showAnalytics ? "Hide Analytics" : "Show Analytics"}
          </Button>
          <Link href="/" passHref>
            <Button variant="outline">Back to Chat</Button>
          </Link>
          <ModeToggle />
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto space-y-8">
          {/* Feedback Analytics Section */}
          {showAnalytics && (
            <>
              {analyticsLoading && (
                <Card>
                  <CardContent className="pt-6 text-center">
                    <p className="text-gray-600">Loading analytics data...</p>
                  </CardContent>
                </Card>
              )}

              {analyticsError && (
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-center">
                      <p className="text-red-500 mb-3">⚠️ {analyticsError}</p>
                      <div className="space-x-2">
                        <Button onClick={loadFeedbackAnalytics} variant="outline" disabled={analyticsLoading}>
                          {analyticsLoading ? 'Retrying...' : 'Retry'}
                        </Button>
                        <Button onClick={() => setShowAnalytics(false)} variant="ghost">
                          Hide Analytics
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {feedbackStats && (
                <>
                  {/* Summary Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Feedback</CardTitle>
                        <MessageSquare className="h-4 w-4 text-muted-foreground" />
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">{feedbackStats.totalFeedback}</div>
                        <p className="text-xs text-muted-foreground">
                          User responses rated
                        </p>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Positive Feedback</CardTitle>
                        <ThumbsUp className="h-4 w-4 text-green-600" />
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold text-green-600">{feedbackStats.thumbsUp}</div>
                        <p className="text-xs text-muted-foreground">
                          {safePercentage(feedbackStats.thumbsUp, feedbackStats.totalFeedback)}% of rated responses
                        </p>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Negative Feedback</CardTitle>
                        <ThumbsDown className="h-4 w-4 text-red-600" />
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold text-red-600">{feedbackStats.thumbsDown}</div>
                        <p className="text-xs text-muted-foreground">
                          {safePercentage(feedbackStats.thumbsDown, feedbackStats.totalFeedback)}% of rated responses
                        </p>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Quality Score</CardTitle>
                        <TrendingUp className="h-4 w-4 text-muted-foreground" />
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">
                          {safePercentage(feedbackStats.thumbsUp, feedbackStats.totalFeedback)}%
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Positive feedback rate
                        </p>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Daily Breakdown Table */}
                  {feedbackStats.dailyBreakdown && Array.isArray(feedbackStats.dailyBreakdown) && feedbackStats.dailyBreakdown.length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle>Daily Feedback Breakdown</CardTitle>
                        <CardDescription>Response quality metrics by day</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="min-w-[100px]">Date</TableHead>
                                <TableHead className="text-center min-w-[80px]">👍 Positive</TableHead>
                                <TableHead className="text-center min-w-[80px]">👎 Negative</TableHead>
                                <TableHead className="text-center min-w-[60px]">Total</TableHead>
                                <TableHead className="text-center min-w-[80px]">Score</TableHead>
                              </TableRow>
                            </TableHeader>
                          <TableBody>
                            {feedbackStats.dailyBreakdown
                              .filter(day => day && typeof day.date === 'string' && 
                                           typeof day.thumbsUp === 'number' && 
                                           typeof day.thumbsDown === 'number' &&
                                           typeof day.total === 'number')
                              .map((day, index) => (
                              <TableRow key={day.date || index}>
                                <TableCell>{formatDate(day.date)}</TableCell>
                                <TableCell className="text-center text-green-600 font-medium">
                                  {day.thumbsUp} ({safePercentage(day.thumbsUp, day.total)}%)
                                </TableCell>
                                <TableCell className="text-center text-red-600 font-medium">
                                  {day.thumbsDown} ({safePercentage(day.thumbsDown, day.total)}%)
                                </TableCell>
                                <TableCell className="text-center font-medium">{day.total}</TableCell>
                                <TableCell className="text-center">
                                  <Badge variant={day.total > 0 && safePercentage(day.thumbsUp, day.total) > 50 ? "default" : "secondary"}>
                                    {safePercentage(day.thumbsUp, day.total)}%
                                  </Badge>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                          </Table>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Recent Feedback Table */}
                  {recentFeedback.length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle>Recent Feedback</CardTitle>
                        <CardDescription>Latest user feedback on AI responses - click to expand Q&A</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="min-w-[40px]"></TableHead>
                                <TableHead className="min-w-[120px]">Time</TableHead>
                                <TableHead className="min-w-[100px]">Feedback</TableHead>
                                <TableHead className="min-w-[80px]">Context</TableHead>
                                <TableHead className="min-w-[200px]">Question Preview</TableHead>
                                <TableHead className="min-w-[100px]">Conversation</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                            {recentFeedback.map((feedback) => {
                              const isExpanded = expandedRows.has(feedback.id);
                              const userQuestion = getDisplayText(feedback, 'question');
                              const aiResponse = getDisplayText(feedback, 'answer');
                              
                              return (
                                <React.Fragment key={feedback.id}>
                                  <TableRow 
                                    className="cursor-pointer hover:bg-muted/50"
                                    onClick={() => toggleRowExpansion(feedback.id)}
                                  >
                                    <TableCell>
                                      {isExpanded ? (
                                        <ChevronDown className="w-4 h-4 text-gray-500" />
                                      ) : (
                                        <ChevronRight className="w-4 h-4 text-gray-500" />
                                      )}
                                    </TableCell>
                                    <TableCell>
                                      <div className="text-sm">
                                        <div>{formatDate(feedback.created_at)}</div>
                                        <div className="text-gray-500">{formatTime(feedback.created_at)}</div>
                                      </div>
                                    </TableCell>
                                    <TableCell>
                                      {feedback.feedback_type === 'thumbs_up' ? (
                                        <Badge className="bg-green-100 text-green-800">
                                          <ThumbsUp className="w-3 h-3 mr-1" />
                                          Positive
                                        </Badge>
                                      ) : (
                                        <Badge className="bg-red-100 text-red-800">
                                          <ThumbsDown className="w-3 h-3 mr-1" />
                                          Negative
                                        </Badge>
                                      )}
                                    </TableCell>
                                    <TableCell>{getContextBadge(feedback.context_info)}</TableCell>
                                    <TableCell className="max-w-[200px]">
                                      <div className="text-sm text-gray-600 truncate">
                                        {truncateText(userQuestion, 80)}
                                      </div>
                                    </TableCell>
                                    <TableCell className="font-mono text-xs">
                                      {feedback.conversation_id.substring(0, 12)}...
                                    </TableCell>
                                  </TableRow>
                                  
                                  {isExpanded && (
                                    <TableRow>
                                      <TableCell colSpan={6} className="bg-muted/20 p-4">
                                        <div className="space-y-4">
                                          <div>
                                            <h4 className="font-semibold text-sm mb-2 flex items-center text-gray-700 dark:text-gray-300">
                                              <MessageSquare className="w-4 h-4 mr-2" />
                                              User Question:
                                            </h4>
                                            <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-md border-l-4 border-blue-200 dark:border-blue-400">
                                              <p className="text-sm text-blue-900 dark:text-blue-100 whitespace-pre-wrap break-words">
                                                {userQuestion}
                                              </p>
                                            </div>
                                          </div>
                                          
                                          <div>
                                            <h4 className="font-semibold text-sm mb-2 flex items-center text-gray-700 dark:text-gray-300">
                                              <MessageSquare className="w-4 h-4 mr-2" />
                                              AI Response:
                                            </h4>
                                            <div className="bg-gray-50 dark:bg-gray-800/50 p-3 rounded-md border-l-4 border-gray-200 dark:border-gray-600">
                                              <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-words max-h-40 overflow-y-auto">
                                                {aiResponse}
                                              </p>
                                            </div>
                                          </div>
                                          
                                          {feedback.context_info && (
                                            <div className="text-xs text-gray-500 pt-2 border-t">
                                              <strong>Context:</strong> {' '}
                                              {feedback.context_info.hasRAGSources && `RAG Sources: ${feedback.context_info.ragSources?.length || 0} documents`}
                                              {feedback.context_info.hasWebSearch && ' | Web Search enabled'}
                                            </div>
                                          )}
                                        </div>
                                      </TableCell>
                                    </TableRow>
                                  )}
                                </React.Fragment>
                              );
                            })}
                            </TableBody>
                          </Table>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {feedbackStats.totalFeedback === 0 && (
                    <Card>
                      <CardContent className="pt-6 text-center">
                        <div className="py-8">
                          <p className="text-gray-600 text-lg mb-2">📊 No feedback data available yet</p>
                          <p className="text-sm text-gray-500 mb-4">
                            Users need to rate AI responses using the thumbs up/down buttons to see analytics here.
                          </p>
                          <div className="text-xs text-gray-400 space-y-1">
                            <p>• Feedback buttons appear below AI responses in the chat</p>
                            <p>• Data will automatically appear here once users start rating</p>
                            <p>• Analytics include quality scores, trends, and context analysis</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </>
              )}
            </>
          )}

          {/* Upload and Management sections - only show when analytics is hidden */}
          {!showAnalytics && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>Upload New Document</CardTitle>
                  <CardDescription>
                    Upload a text or PDF file. It will be processed and made
                    available for chat.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <UploadDropzone
                    onFileSelect={handleFileSelected}
                    accept=".txt,.pdf"
                    disabled={isUploading}
                  />
                  
                  {selectedFiles.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-sm font-medium">
                        {selectedFiles.length} file{selectedFiles.length === 1 ? '' : 's'} selected:
                      </p>
                      <div className="max-h-32 overflow-y-auto">
                        {selectedFiles.map((file, index) => (
                          <div key={index} className="flex items-center justify-between text-sm p-2 bg-muted rounded">
                            <span>{file.name}</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setSelectedFiles(prev => prev.filter((_, i) => i !== index));
                              }}
                              disabled={isUploading}
                            >
                              Remove
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <Button
                    onClick={handleUpload}
                    disabled={selectedFiles.length === 0 || isUploading}
                    className="w-full"
                  >
                    {isUploading ? "Processing & Uploading..." : `Upload ${selectedFiles.length} File${selectedFiles.length === 1 ? '' : 's'}`}
                  </Button>
                </CardContent>
                {uploadStatus && (
                  <CardFooter>
                    <p className="text-sm text-muted-foreground">{uploadStatus}</p>
                  </CardFooter>
                )}
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Manage Uploaded Documents</CardTitle>
                </CardHeader>
                <CardContent>
                  {fetchError && (
                    <p className="text-sm text-destructive mb-4">{fetchError}</p>
                  )}
                  {uploadedDocuments.length === 0 && !fetchError ? (
                    <p className="text-sm text-muted-foreground">
                      No documents uploaded yet.
                    </p>
                  ) : (
                    <ScrollArea className="h-[300px] pr-3">
                      <ul className="space-y-3">
                        {uploadedDocuments.map((doc) => (
                          <li
                            key={doc.id}
                            className="flex items-center justify-between p-3 border rounded-md hover:bg-muted/50"
                            title={doc.name}
                          >
                            <div className="flex items-center space-x-3 min-w-0 flex-1 mr-3">
                              {doc.name.toLowerCase().endsWith(".pdf") ? (
                                <File
                                  size={20}
                                  className="flex-shrink-0 text-muted-foreground"
                                />
                              ) : (
                                <FileText
                                  size={20}
                                  className="flex-shrink-0 text-muted-foreground"
                                />
                              )}
                              <span
                                className="text-sm font-medium"
                                title={doc.name}
                              >
                                {doc.name}
                              </span>
                            </div>
                            <div className="flex items-center space-x-2 flex-shrink-0 min-w-fit">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 p-0 hover:bg-destructive/10 group"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteDocument(doc.id, doc.name);
                                }}
                                title={`Delete ${doc.name}`}
                              >
                                <Trash2
                                  size={16}
                                  className="text-destructive/70 group-hover:text-destructive"
                                />
                              </Button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </ScrollArea>
                  )}
                </CardContent>
              </Card>

              <PromptManager />
            </>
          )}
        </div>
      </main>
    </div>
  );
}
