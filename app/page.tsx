"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useChat, type Message as AIMessage } from "@ai-sdk/react";
import { supabase } from "@/lib/supabaseClient";
import { ModeToggle } from "@/components/mode-toggle";
import React from "react";
import Sidebar from "@/components/sidebar";
import ChatArea from "@/components/chat-area";

// MODIFIED: Temporarily re-define SourceChunk here. Ideally, import from a shared types file or chat-area.tsx if exported.
interface SourceChunk {
  id: string | number;
  content: string;
}

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
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [messageChunksMap, setMessageChunksMap] = useState<{
    [key: string]: SourceChunk[];
  }>({});
  const currentStreamDataRef = useRef<SourceChunk[] | undefined>(undefined);

  const {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    isLoading,
    error,
    data,
  } = useChat({
    api: "/api/chat",
    body: {
      documentId:
        selectedDocumentId !== null ? String(selectedDocumentId) : undefined,
      documentName:
        selectedDocumentName !== null ? selectedDocumentName : undefined,
    },
    onResponse: (response) => {
      console.log("useChat - onResponse received:", response);
      if (!response.ok) {
        console.error("useChat - onResponse Error:", response.statusText);
      }
    },
    onFinish: (message: AIMessage) => {
      console.log(
        "useChat - onFinish. Full message object:",
        JSON.stringify(message, null, 2)
      );
      console.log(
        "useChat - onFinish. message.data property value:",
        JSON.stringify(message.data, null, 2)
      );
      console.log(
        "useChat - onFinish. Top-level data (from useChat() scope) value at onFinish:",
        data
      );
      console.log(
        "useChat - onFinish. currentStreamDataRef.current value at onFinish:",
        currentStreamDataRef.current
      );

      let chunksForMessage: SourceChunk[] | undefined = undefined;

      // 1. Try to get chunks from message.data (ideal if SDK populates this reliably)
      if (
        message.data &&
        Array.isArray(message.data) &&
        message.data.length > 0
      ) {
        chunksForMessage = message.data as unknown as SourceChunk[];
        console.log(
          `Chunks for message ID ${message.id} will be taken from message.data:`,
          chunksForMessage
        );
      }
      // 2. Else, try using currentStreamDataRef.current (latched from useEffect [data])
      else if (
        currentStreamDataRef.current &&
        currentStreamDataRef.current.length > 0
      ) {
        chunksForMessage = currentStreamDataRef.current;
        console.log(
          `Chunks for message ID ${message.id} will be taken from currentStreamDataRef.current:`,
          chunksForMessage
        );
      }
      // 3. Fallback to top-level data from useChat scope (least likely to work based on logs)
      else if (data && Array.isArray(data) && data.length > 0) {
        chunksForMessage = data as unknown as SourceChunk[];
        console.log(
          `Chunks for message ID ${message.id} will be taken from top-level data (from useChat scope):`,
          chunksForMessage
        );
      }

      if (message.role === "assistant" && chunksForMessage) {
        setMessageChunksMap((prevMap) => ({
          ...prevMap,
          [message.id]: chunksForMessage,
        }));
        console.log(
          `Successfully stored chunks for assistant message ID ${message.id}. Chunks:`,
          chunksForMessage
        );
      } else if (message.role === "assistant") {
        console.log(
          `No suitable chunk data found to store for assistant message ID ${
            message.id
          }. message.data was: ${JSON.stringify(
            message.data
          )}, currentStreamDataRef.current was: ${JSON.stringify(
            currentStreamDataRef.current
          )}, top-level data was: ${JSON.stringify(data)}.`
        );
      }
    },
    onError: (error) => {
      console.error("useChat - onError triggered:", error);
    },
  });

  // useEffect to capture streaming data into currentStreamDataRef.current
  useEffect(() => {
    if (isLoading && data && Array.isArray(data) && data.length > 0) {
      // Only update if we are actively loading (streaming) and have data
      console.log(
        "useEffect [data, isLoading]: Stream active and data available. Updating currentStreamDataRef.current:",
        data
      );
      currentStreamDataRef.current = data as unknown as SourceChunk[];
    } else if (!isLoading) {
      // When loading stops (stream ends), clear the ref.
      // This ensures it's clean for the next message and onFinish doesn't use stale data from a previous stream
      // if it somehow runs after this effect but before the next stream starts.
      console.log(
        "useEffect [data, isLoading]: Stream stopped. Clearing currentStreamDataRef.current. Was:",
        currentStreamDataRef.current
      );
      currentStreamDataRef.current = undefined;
    }
  }, [data, isLoading]); // Dependency array is just data and isLoading

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
        if (selectedDocumentId === docId) {
          setSelectedDocumentId(null);
          setSelectedDocumentName(null);
        }
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
      {/* Updated Header */}
      <header className="p-4 border-b flex justify-between items-center">
        <h1 className="text-xl font-semibold">
          Chat with your Docs (RAG Demo)
        </h1>
        <ModeToggle />
      </header>

      <div className="flex flex-1 overflow-hidden relative">
        {/* Sidebar for Upload and Doc List */}
        <Sidebar
          isSidebarOpen={isSidebarOpen}
          setIsSidebarOpen={setIsSidebarOpen}
          uploadedDocuments={uploadedDocuments}
          selectedDocumentId={selectedDocumentId}
          setSelectedDocumentId={setSelectedDocumentId}
          selectedDocumentName={selectedDocumentName}
          setSelectedDocumentName={setSelectedDocumentName}
          handleFileSelected={handleFileSelected}
          handleUpload={handleUpload}
          handleDeleteDocument={handleDeleteDocument}
          isUploading={isUploading}
          uploadStatus={uploadStatus}
          fetchError={fetchError}
          isLoading={isLoading}
          selectedFile={selectedFile}
        />

        {/* Main Chat Area */}
        <ChatArea
          messages={messages}
          input={input}
          handleInputChange={handleInputChange}
          handleSubmit={handleSubmit}
          isLoading={isLoading}
          error={error}
          selectedDocumentName={selectedDocumentName}
          messagesContainerRef={messagesContainerRef}
          messageChunksMap={messageChunksMap}
        />
      </div>
    </div>
  );
}
