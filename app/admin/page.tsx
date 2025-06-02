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
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
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

  const handleFileSelected = useCallback((file: File) => {
    setSelectedFile(file);
    setUploadStatus("");
    console.log("File selected for upload:", file.name);
  }, []);

  const extractTextFromFile = async (file: File): Promise<string> => {
    if (file.type === "application/pdf") {
      const pdfjsLib = await import("pdfjs-dist");
      pdfjsLib.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
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
    if (!selectedFile) {
      setUploadStatus("Please select a file first.");
      return;
    }

    setIsUploading(true);
    setUploadStatus(`Processing ${selectedFile.name}...`);

    let textContent = "";
    const fileName = selectedFile.name;

    try {
      textContent = await extractTextFromFile(selectedFile);

      if (!textContent.trim()) {
        throw new Error("Could not extract text from file.");
      }

      setUploadStatus(`Uploading extracted text from ${fileName}...`);

      const response = await fetch("/api/upload", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ fileName: fileName, textContent: textContent }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        setUploadStatus(
          `Successfully uploaded and processed ${fileName}. Document ID: ${result.documentId}`
        );
        // Add to the top of the list
        setUploadedDocuments((prevDocs) => [
          { id: result.documentId, name: fileName },
          ...prevDocs,
        ]);
        setSelectedFile(null); // Clear selected file after successful upload
      } else {
        setUploadStatus(`Upload failed: ${result.error || "Unknown error"}`);
        console.error("Upload failed:", result);
      }
    } catch (error) {
      console.error("Processing/Upload error:", error);
      setUploadStatus(
        `Error: ${error instanceof Error ? error.message : "Unknown error"}`
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
              <Button
                onClick={handleUpload}
                disabled={!selectedFile || isUploading}
                className="w-full"
              >
                {isUploading ? "Processing & Uploading..." : "Upload File"}
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
