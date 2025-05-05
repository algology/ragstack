"use client";

import { useState, useRef, useEffect } from "react";
import { useChat } from "ai/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import * as pdfjsLib from "pdfjs-dist";
import { supabase } from "@/lib/supabaseClient";
import { File, FileText } from "lucide-react";

interface UploadedDocument {
  id: number;
  name: string;
}

export default function Chat() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [uploadedDocuments, setUploadedDocuments] = useState<
    UploadedDocument[]
  >([]);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    import("pdfjs-dist").then((pdfjsLib) => {
      pdfjsLib.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
    });
  }, []);

  useEffect(() => {
    const fetchDocuments = async () => {
      setFetchError(null);
      console.log("Fetching documents...");
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
    };
    fetchDocuments();
  }, []);

  const { messages, input, handleInputChange, handleSubmit, isLoading } =
    useChat({
      api: "/api/chat",
      // Optional: Add initial messages or other config
    });

  // Effect to scroll to bottom when messages change
  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop =
        messagesContainerRef.current.scrollHeight;
    }
  }, [messages]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setSelectedFile(event.target.files[0]);
      setUploadStatus(""); // Clear previous status
    }
  };

  const extractTextFromPdf = async (file: File): Promise<string> => {
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
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setUploadStatus("Please select a file first.");
      return;
    }

    setIsUploading(true);
    setUploadStatus(`Processing ${selectedFile.name}...`);

    let textContent = "";
    let fileName = selectedFile.name;

    try {
      if (selectedFile.type === "application/pdf") {
        textContent = await extractTextFromPdf(selectedFile);
      } else if (selectedFile.type === "text/plain") {
        textContent = await selectedFile.text();
      } else {
        throw new Error("Unsupported file type.");
      }

      if (!textContent.trim()) {
        throw new Error("Could not extract text from file.");
      }

      setUploadStatus(`Uploading extracted text from ${fileName}...`);

      // Send filename and text content to the backend
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
        setUploadedDocuments((prevDocs) => [
          { id: result.documentId, name: fileName },
          ...prevDocs,
        ]);
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
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      setSelectedFile(null);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-background text-foreground">
      {/* Header - Can add title or logo here */}
      <header className="p-4 border-b">
        <h1 className="text-xl font-semibold">
          Chat with your Docs (RAG Demo)
        </h1>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar for Upload and Doc List */}
        <aside className="w-1/4 p-4 border-r flex flex-col space-y-4 overflow-y-auto">
          <Card>
            <CardHeader>
              <CardTitle>Upload Document</CardTitle>
              <CardDescription>
                Upload a text or PDF file to chat with.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                disabled={isUploading}
                accept=".txt,.pdf"
              />
              <Button
                onClick={handleUpload}
                disabled={!selectedFile || isUploading}
                className="w-full"
              >
                {isUploading ? "Processing/Uploading..." : "Upload File"}
              </Button>
            </CardContent>
            {uploadStatus && (
              <CardFooter>
                <p className="text-sm text-muted-foreground">{uploadStatus}</p>
              </CardFooter>
            )}
          </Card>

          <Card className="flex-1 flex flex-col">
            <CardHeader>
              <CardTitle>Uploaded Documents</CardTitle>
            </CardHeader>
            <CardContent className="flex-1 overflow-hidden">
              {fetchError && (
                <p className="text-sm text-destructive">{fetchError}</p>
              )}
              {uploadedDocuments.length === 0 && !fetchError ? (
                <p className="text-sm text-muted-foreground">
                  No documents uploaded yet.
                </p>
              ) : (
                <ScrollArea className="h-full">
                  <ul className="space-y-2 pr-3">
                    {uploadedDocuments.map((doc) => (
                      <li
                        key={doc.id}
                        className="flex items-center space-x-2 text-sm p-1 rounded hover:bg-muted break-all"
                      >
                        {doc.name.toLowerCase().endsWith(".pdf") ? (
                          <File size={16} className="flex-shrink-0" />
                        ) : (
                          <FileText size={16} className="flex-shrink-0" />
                        )}
                        <span title={doc.name}>{doc.name}</span>
                      </li>
                    ))}
                  </ul>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </aside>

        {/* Main Chat Area */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {/* Make this div scrollable and take up available space */}
          <div
            ref={messagesContainerRef}
            className="flex-1 overflow-y-auto p-4"
          >
            <div className="space-y-4">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`flex ${
                    m.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  <Card
                    className={`max-w-xs lg:max-w-md ${
                      m.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    }`}
                  >
                    <CardContent className="p-3">
                      <p className="text-sm whitespace-pre-wrap">{m.content}</p>
                    </CardContent>
                  </Card>
                </div>
              ))}
              {isLoading && messages[messages.length - 1]?.role === "user" && (
                <div className="flex justify-start">
                  <Card className="max-w-xs lg:max-w-md bg-muted animate-pulse">
                    <CardContent className="p-3">
                      <p className="text-sm">Thinking...</p>
                    </CardContent>
                  </Card>
                </div>
              )}
            </div>
          </div>

          <div className="p-4 border-t">
            <form
              onSubmit={handleSubmit}
              className="flex items-center space-x-2"
            >
              <Input
                value={input}
                onChange={handleInputChange}
                placeholder="Ask a question about the document..."
                disabled={isLoading}
              />
              <Button type="submit" disabled={isLoading}>
                Send
              </Button>
            </form>
          </div>
        </main>
      </div>
    </div>
  );
}
