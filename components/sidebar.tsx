import React, { useState, useEffect, useRef } from "react";
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
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { UploadDropzone } from "@/components/upload-dropzone";
import { ModeToggle } from "@/components/mode-toggle";

interface UploadedDocument {
  id: number;
  name: string;
}

interface SidebarProps {
  isSidebarOpen: boolean;
  setIsSidebarOpen: (isOpen: boolean) => void;
  uploadedDocuments: UploadedDocument[];
  selectedDocumentId: number | null;
  setSelectedDocumentId: (id: number | null) => void;
  setSelectedDocumentName: (name: string | null) => void;
  handleFileSelected: (file: File) => void;
  handleUpload: () => void;
  handleDeleteDocument: (docId: number, docName: string) => void;
  isUploading: boolean;
  uploadStatus: string;
  fetchError: string | null;
  isLoading: boolean; // from useChat, for disabling buttons
  selectedFile: File | null;
}

const Sidebar: React.FC<SidebarProps> = ({
  isSidebarOpen,
  setIsSidebarOpen,
  uploadedDocuments,
  selectedDocumentId,
  setSelectedDocumentId,
  setSelectedDocumentName,
  handleFileSelected,
  handleUpload,
  handleDeleteDocument,
  isUploading,
  uploadStatus,
  fetchError,
  isLoading,
  selectedFile,
}) => {
  const [overflowClass, setOverflowClass] = useState("overflow-hidden");
  const sidebarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isSidebarOpen) {
      // Start with hidden, then switch to auto after transition
      setOverflowClass("overflow-hidden"); // Ensure it's hidden during expansion start
      timer = setTimeout(() => {
        setOverflowClass("overflow-y-auto");
      }, 300); // Corresponds to transition duration-300
    } else {
      setOverflowClass("overflow-hidden"); // Apply immediately when collapsing
    }
    return () => clearTimeout(timer);
  }, [isSidebarOpen]);

  return (
    <aside
      ref={sidebarRef}
      className={`relative border-r flex flex-col space-y-4 transition-all duration-300 ease-in-out ${
        isSidebarOpen ? "w-1/4 p-4" : "w-12 p-2 border-r"
      } ${overflowClass}`}
    >
      {/* Content that hides/shows - Placed before the button so button can be pushed down by flex-1 content */}
      <div
        className={`flex flex-col space-y-4 ${
          isSidebarOpen ? "flex-1 opacity-100" : "hidden"
        } transition-opacity duration-150`}
      >
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
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 p-0 hover:bg-destructive/20 flex-shrink-0 mr-2"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteDocument(doc.id, doc.name);
                        }}
                        title={`Delete ${doc.name}`}
                        disabled={isLoading}
                      >
                        <Trash2
                          size={14}
                          className="text-destructive/70 hover:text-destructive"
                        />
                      </Button>
                      {doc.name.toLowerCase().endsWith(".pdf") ? (
                        <File size={16} className="flex-shrink-0" />
                      ) : (
                        <FileText size={16} className="flex-shrink-0" />
                      )}
                      <span className="flex-1 min-w-0 truncate text-xs">
                        {doc.name}
                      </span>
                    </li>
                  ))}
                </ul>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Collapse/Expand Button - At the bottom of the aside flex container */}
      <div
        className={`mt-auto pt-2 ${
          isSidebarOpen
            ? "border-t flex justify-end items-center space-x-2"
            : "flex flex-col items-center space-y-2 w-full"
        }`}
      >
        <div className={`${!isSidebarOpen ? "hidden" : ""}`}>
          <ModeToggle />
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          title={isSidebarOpen ? "Collapse Sidebar" : "Expand Sidebar"}
          className="h-8 w-8 p-1.5"
        >
          {isSidebarOpen ? (
            <PanelLeftClose size={18} />
          ) : (
            <PanelLeftOpen size={18} />
          )}
        </Button>
      </div>
    </aside>
  );
};

export default Sidebar;
