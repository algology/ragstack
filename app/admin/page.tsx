"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
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
} from "lucide-react";
import { UploadDropzone } from "@/components/upload-dropzone";
import { ModeToggle } from "@/components/mode-toggle";
import { supabase } from "@/lib/supabaseClient";
import Link from "next/link";
import Image from "next/image";

interface UploadedDocument {
  id: number;
  name: string;
}

export default function AdminPage() {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string>("");
  const [uploadedDocuments, setUploadedDocuments] = useState<
    UploadedDocument[]
  >([]);
  const [fetchError, setFetchError] = useState<string | null>(null);

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

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const handleFileSelected = useCallback((files: File[]) => {
    setSelectedFiles(files);
    setUploadStatus("");
    console.log("Files selected for upload:", files.map(f => f.name));
  }, []);

  const extractTextFromFile = async (file: File): Promise<string> => {
    if (file.type === "application/pdf") {
      const pdfjsLib = await import("pdfjs-dist");
              pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      let fullText = "";
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText =
          textContent.items
            ?.map((item) => ("str" in item ? item.str : ""))
            .join(" \n") ?? "";
        fullText += pageText + " \n";
      }
      return fullText;
    } else if (file.type === "text/plain") {
      return await file.text();
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
          const textContent = await extractTextFromFile(file);

          if (!textContent.trim()) {
            throw new Error("Could not extract text from file.");
          }

          setUploadStatus(`Uploading ${fileName} (${i + 1} of ${selectedFiles.length})...`);

          // Create FormData for PDF files to send both file and text content
          if (file.type === "application/pdf") {
            const formData = new FormData();
            formData.append("file", file);
            formData.append("textContent", textContent);

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
            // For text files, continue with JSON upload
            const response = await fetch("/api/upload", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ fileName: fileName, textContent: textContent }),
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
          <Link href="/" passHref>
            <Button variant="outline">Back to Chat</Button>
          </Link>
          <ModeToggle />
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto space-y-8">
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
        </div>
      </main>
    </div>
  );
}
