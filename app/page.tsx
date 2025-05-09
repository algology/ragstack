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
  const accumulatedChunksForCurrentStreamRef = useRef<SourceChunk[]>([]);

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
      console.log(
        "%cuseChat - onResponse%c received for a NEW stream. Response OK: %s",
        "color: blue; font-weight: bold;",
        "color: blue;",
        response.ok
      );
      if (!response.ok) {
        console.error("useChat - onResponse Error:", response.statusText);
      }
      console.log(
        "%cuseChat - onResponse%c: Resetting accumulatedChunksForCurrentStreamRef. Current length: %d",
        "color: blue; font-weight: bold;",
        "color: blue;",
        accumulatedChunksForCurrentStreamRef.current.length
      );
      accumulatedChunksForCurrentStreamRef.current = [];
    },
    onFinish: (message: AIMessage) => {
      console.log(
        `%cuseChat - onFinish%c for message ID: ${message.id}, Role: ${message.role}`,
        "color: green; font-weight: bold;",
        "color: green;"
      );

      let chunksForMessage: SourceChunk[] | undefined = undefined;

      // Priority: Use the chunks accumulated specifically for this stream.
      if (accumulatedChunksForCurrentStreamRef.current.length > 0) {
        chunksForMessage = accumulatedChunksForCurrentStreamRef.current;
        console.log(
          `%cuseChat - onFinish%c: Chunks for message ID ${message.id} will be taken from accumulatedChunksForCurrentStreamRef (length ${chunksForMessage.length}):`,
          "color: green; font-weight: bold;",
          "color: green;",
          JSON.stringify(
            chunksForMessage.map((c) => ({
              id: c.id,
              content: c.content.substring(0, 30) + "...",
            })),
            null,
            2
          )
        );
      }
      // Fallback 1: message.data (if SDK ever populates it correctly with isolated data)
      else if (
        message.data &&
        Array.isArray(message.data) &&
        message.data.length > 0
      ) {
        chunksForMessage = message.data as unknown as SourceChunk[];
        console.log(
          `%cuseChat - onFinish%c: WARNING - accumulatedChunksForCurrentStreamRef was empty. Falling back to message.data for ID ${message.id}:`,
          "color: orange; font-weight: bold;",
          "color: orange;",
          JSON.stringify(
            chunksForMessage.map((c) => ({
              id: c.id,
              content: c.content.substring(0, 30) + "...",
            })),
            null,
            2
          )
        );
      }
      // Fallback 2: top-level data (highly unlikely to be correct and isolated)
      else if (data && Array.isArray(data) && data.length > 0) {
        chunksForMessage = data as unknown as SourceChunk[]; // Potentially cumulative/stale
        console.log(
          `%cuseChat - onFinish%c: CRITICAL WARNING - accumulatedChunksForCurrentStreamRef AND message.data were empty. Falling back to top-level 'data' for ID ${message.id}:`,
          "color: red; font-weight: bold;",
          "color: red;",
          JSON.stringify(
            chunksForMessage.map((c) => ({
              id: c.id,
              content: c.content.substring(0, 30) + "...",
            })),
            null,
            2
          )
        );
      }

      if (
        message.role === "assistant" &&
        chunksForMessage &&
        chunksForMessage.length > 0
      ) {
        console.log(
          `%cuseChat - onFinish%c: Storing ${chunksForMessage.length} chunks for assistant message ID ${message.id}.`,
          "color: green; font-weight: bold;",
          "color: green;"
        );
        setMessageChunksMap((prevMap) => {
          const newMap = {
            ...prevMap,
            [message.id]: chunksForMessage!,
          };
          console.log(
            `%cuseChat - onFinish%c: Updated messageChunksMap for ID ${message.id}. New map keys: %s`,
            "color: green; font-weight: bold;",
            "color: green;",
            Object.keys(newMap).join(", ")
          );
          return newMap;
        });
      } else if (message.role === "assistant") {
        console.log(
          `%cuseChat - onFinish%c: No suitable chunk data found to store for assistant message ID ${message.id}.`,
          "color: yellow; font-weight: bold;",
          "color: yellow;"
        );
      }
      // Reset ref after processing, regardless of outcome for this message.
      // onResponse should handle this for new streams, but this is an extra safeguard.
      console.log(
        "%cuseChat - onFinish%c: Resetting accumulatedChunksForCurrentStreamRef post-processing. Length before reset: %d",
        "color: green; font-weight: bold;",
        "color: green;",
        accumulatedChunksForCurrentStreamRef.current.length
      );
      accumulatedChunksForCurrentStreamRef.current = [];
    },
    onError: (error) => {
      console.error("useChat - onError triggered:", error);
    },
  });

  // useEffect to capture streaming data into accumulatedChunksForCurrentStreamRef
  useEffect(() => {
    if (isLoading && data && Array.isArray(data)) {
      console.log(
        "%cuseEffect[data, isLoading]%c: Stream active. Received 'data' prop. Raw data length: %d",
        "color: magenta; font-weight: bold;",
        "color: magenta;",
        data.length
      );

      let allChunksFromDataPacket: SourceChunk[] = [];
      // Attempt to parse chunks from the data packet
      if (data.length === 1 && Array.isArray(data[0])) {
        allChunksFromDataPacket = data[0] as unknown as SourceChunk[];
      } else if (
        data.length > 0 &&
        typeof data[0] === "object" &&
        data[0] !== null &&
        "content" in data[0]
      ) {
        allChunksFromDataPacket = data as unknown as SourceChunk[];
      }

      if (allChunksFromDataPacket.length > 0) {
        const finalizedChunkIds = new Set<string | number>();
        Object.values(messageChunksMap).forEach((chunkList) =>
          chunkList.forEach((c) => finalizedChunkIds.add(c.id))
        );

        const newChunksForThisStreamUpdate: SourceChunk[] = [];
        const seenInThisPacket = new Set<string | number>(); // To ensure uniqueness within this packet's processing

        for (const chunk of allChunksFromDataPacket) {
          if (
            chunk &&
            typeof chunk.id !== "undefined" &&
            !finalizedChunkIds.has(chunk.id) &&
            !seenInThisPacket.has(chunk.id)
          ) {
            newChunksForThisStreamUpdate.push(chunk);
            seenInThisPacket.add(chunk.id);
          }
        }

        if (newChunksForThisStreamUpdate.length > 0) {
          console.log(
            "%cuseEffect[data, isLoading]%c: Found %d truly new (unfinalized and unique in this packet) chunks. Assigning to accumulatedChunksForCurrentStreamRef. First new chunk ID: %s",
            "color: magenta; font-weight: bold;",
            "color: magenta;",
            newChunksForThisStreamUpdate.length,
            newChunksForThisStreamUpdate[0]?.id
          );
          // Since onResponse clears the ref, and this effect filters for the current stream,
          // we can directly assign. If the backend sends chunks for the current stream in multiple 'data' updates,
          // this assignment will overwrite. For that, we might need to append if IDs are truly unique per stream segment.
          // However, if backend sends full list of *new* chunks for current stream each time, this is fine.
          // Given the Vercel SDK's `data` behavior (often the full array of all data parts sent *so far*),
          // our filtering for `!finalizedChunkIds.has(chunk.id)` is key.
          // accumulatedChunksForCurrentStreamRef.current should always be the *set of new chunks for the current message stream*.
          accumulatedChunksForCurrentStreamRef.current =
            newChunksForThisStreamUpdate;
        } else {
          console.log(
            "%cuseEffect[data, isLoading]%c: No *new* unfinalized chunks found in this 'data' packet to update accumulatedChunksForCurrentStreamRef.",
            "color: magenta; font-weight: bold;",
            "color: magenta;"
          );
          // If no new chunks found in *this data packet*, we should not clear the ref here if it already has
          // valid chunks from a *previous data packet of the same stream*.
          // The ref is only cleared by onResponse (start of new stream) or onFinish (end of current stream).
        }
      } else {
        console.log(
          "%cuseEffect[data, isLoading]%c: No processable chunks found in 'data' prop this time (allChunksFromDataPacket was empty).",
          "color: magenta; font-weight: bold;",
          "color: magenta;"
        );
      }
    } else if (!isLoading) {
      // When loading stops, onFinish should handle and clear the ref.
      // console.log(
      //   "%cuseEffect[data, isLoading]%c: Stream stopped. accumulatedChunksForCurrentStreamRef should be handled by onFinish. Current ref (length %d):",
      //   "color: magenta; font-weight: bold;", "color: magenta;", accumulatedChunksForCurrentStreamRef.current.length,
      //   JSON.stringify(accumulatedChunksForCurrentStreamRef.current.map(c=>c.id))
      // );
      // No need to clear here, onFinish handles it. Potentially onResponse already cleared it if a new stream started immediately.
    }
  }, [data, isLoading, messageChunksMap]);

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
        <h1 className="text-xl font-semibold">RAG Template</h1>
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
