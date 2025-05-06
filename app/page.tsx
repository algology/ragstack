"use client";

import { useState, useRef, useEffect, useCallback } from "react";
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
import { supabase } from "@/lib/supabaseClient";
import { File, FileText, XCircle } from "lucide-react";
import { UploadDropzone } from "@/components/upload-dropzone";
import { ModeToggle } from "@/components/mode-toggle";

interface UploadedDocument {
  id: number;
  name: string;
}

export default function Chat() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string>("");
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [uploadedDocuments, setUploadedDocuments] = useState<
    UploadedDocument[]
  >([]);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [selectedDocumentId, setSelectedDocumentId] = useState<number | null>(
    null
  );
  const [selectedDocumentName, setSelectedDocumentName] = useState<
    string | null
  >(null);

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
      body: {
        documentId:
          selectedDocumentId !== null ? String(selectedDocumentId) : undefined,
        documentName:
          selectedDocumentName !== null ? selectedDocumentName : undefined,
      },
    });

  // Effect to scroll to bottom when messages change
  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop =
        messagesContainerRef.current.scrollHeight;
    }
  }, [messages]);

  const handleFileSelected = useCallback((file: File) => {
    setSelectedFile(file);
    setUploadStatus("");
    console.log("File selected:", file.name);
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
    let fileName = selectedFile.name;

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
        setUploadedDocuments((prevDocs) => [
          { id: result.documentId, name: fileName },
          ...prevDocs,
        ]);
        setSelectedFile(null);
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

  return (
    <div className="flex flex-col h-screen bg-background text-foreground">
      {/* Updated Header */}
      <header className="p-4 border-b flex justify-between items-center">
        <h1 className="text-xl font-semibold">
          Chat with your Docs (RAG Demo)
        </h1>
        <ModeToggle />
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
                    <Button
                      variant="ghost"
                      size="sm"
                      className={`w-full justify-start text-xs mb-2 rounded hover:bg-muted ${
                        selectedDocumentId === null
                          ? "bg-primary text-primary-foreground hover:bg-primary/90"
                          : "hover:bg-muted"
                      }`}
                      onClick={() => {
                        setSelectedDocumentId(null);
                        setSelectedDocumentName(null);
                      }}
                      disabled={isLoading}
                    >
                      Chat with All Documents
                    </Button>
                    {uploadedDocuments.map((doc) => (
                      <li
                        key={doc.id}
                        className={`flex items-center space-x-2 text-sm p-1 rounded break-all cursor-pointer ${
                          selectedDocumentId === doc.id
                            ? "bg-primary text-primary-foreground hover:bg-primary/90"
                            : "hover:bg-muted"
                        }`}
                        onClick={() => {
                          setSelectedDocumentId(doc.id);
                          setSelectedDocumentName(doc.name);
                        }}
                        title={doc.name}
                      >
                        {doc.name.toLowerCase().endsWith(".pdf") ? (
                          <File size={16} className="flex-shrink-0" />
                        ) : (
                          <FileText size={16} className="flex-shrink-0" />
                        )}
                        <span>{doc.name}</span>
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
          {/* Context Header */}
          <div className="p-2 px-4 border-b bg-muted/30">
            <p className="text-sm font-medium text-muted-foreground">
              {selectedDocumentName
                ? `Chatting with: ${selectedDocumentName}`
                : "Chatting with: All Documents"}
            </p>
          </div>

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
                    className={`max-w-xs lg:max-w-md py-1 ${
                      m.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    }`}
                  >
                    <CardContent className="py-1 px-3">
                      <p className="text-sm whitespace-pre-wrap">{m.content}</p>
                    </CardContent>
                  </Card>
                </div>
              ))}
              {isLoading && messages[messages.length - 1]?.role === "user" && (
                <div className="flex justify-start p-3">
                  <div className="flex space-x-1 justify-center items-center">
                    <span className="sr-only">Thinking...</span>
                    <div className="h-2 w-2 bg-current rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                    <div className="h-2 w-2 bg-current rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                    <div className="h-2 w-2 bg-current rounded-full animate-bounce"></div>
                  </div>
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
