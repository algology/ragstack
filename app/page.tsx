"use client";

import { useState, useEffect, useMemo } from "react";
import React, { type FC } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// PDF Viewer imports
import { PDFViewerProvider, usePDFViewer } from "@/contexts/pdf-viewer-context";
import dynamic from "next/dynamic";

// Dynamically import PDFViewer to avoid SSR issues
const PDFViewer = dynamic(() => import("@/components/pdf-viewer").then(mod => ({ default: mod.PDFViewer })), {
  ssr: false,
  loading: () => <div className="flex items-center justify-center h-full">Loading PDF viewer...</div>
});

// Assistant UI Components
import {
  AssistantRuntimeProvider,
  ActionBarPrimitive,
  BranchPickerPrimitive,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useMessage,
  useThread,
  type ThreadMessage,
} from "@assistant-ui/react";
import { useChatRuntime } from "@assistant-ui/react-ai-sdk";

import {
  ArrowDownIcon,
  ArrowRightIcon,
  ArrowUpIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyIcon,
  FileText,
  GlobeIcon,
  RefreshCwIcon,
} from "lucide-react";

import { MarkdownText } from "@/components/assistant-ui/markdown-text";
import { TooltipIconButton } from "@/components/assistant-ui/tooltip-icon-button";
import { FlowingPrompts } from "@/components/flowing-prompts";

interface DocumentChunk {
  id?: string; // Chunk ID
  document_id?: number; // Document ID
  content: string;
  name?: string;
  page_number?: number; // Page number where this chunk appears in the original PDF
  additional_pages?: number[]; // Additional pages where content was found (for multi-page references)
}

interface WebSource {
  uri?: string;
  title?: string;
}

interface BlendedSource {
  type: "rag" | "web";
  content: string;
  name: string;
  uri?: string; // For web sources
  documentId?: string; // For RAG sources
  pageNumber?: number; // For RAG sources with page information
  additionalPages?: number[]; // Additional pages where content was found (for multi-page references)
}

interface GroundingMetadata {
  searchEntryPoint?: {
    renderedContent?: string;
  };
  webSearchQueries?: string[];
  groundingChunks?: Array<{
    web?: WebSource;
  }>;
}

type MessageSourcesMap = Map<string, DocumentChunk[]>;
type MessageGroundingMap = Map<string, GroundingMetadata | undefined>;

export default function ChatPage() {
  const [currentChatContextName, setCurrentChatContextName] =
    useState<string>("All Documents");
  const [currentChatContextId, setCurrentChatContextId] = useState<
    string | undefined
  >(undefined);
  const [isSearchEnabled, setIsSearchEnabled] = useState<boolean>(false);
  const [messageSources, setMessageSources] = useState<MessageSourcesMap>(
    new Map()
  );
  const [messageGrounding, setMessageGrounding] = useState<MessageGroundingMap>(
    new Map()
  );

  const chatRuntimeBody = useMemo(
    () => ({
      documentId: currentChatContextId,
      documentName:
        currentChatContextName === "All Documents"
          ? undefined
          : currentChatContextName,
      enableSearch: isSearchEnabled,
    }),
    [currentChatContextId, currentChatContextName, isSearchEnabled]
  );

  const runtime = useChatRuntime({
    api: "/api/chat",
    initialMessages: [],
    body: chatRuntimeBody,
    onFinish: (message: ThreadMessage) => {
      if (message.role === "assistant") {
        console.log(
          "CLIENT: Assistant message finished. Message ID:",
          message.id
        );

        let sourcesToSet: DocumentChunk[] = [];
        let groundingToSet: GroundingMetadata | undefined = undefined;

        try {
          // Handle the unstable_data format from our custom streaming
          const unstableDataArray = (message.metadata as any)?.unstable_data;

          if (
            Array.isArray(unstableDataArray) &&
            unstableDataArray.length > 0
          ) {
            console.log(
              "CLIENT: Received unstable_data array:",
              unstableDataArray
            );

            for (let i = 0; i < unstableDataArray.length; i++) {
              const payload = unstableDataArray[i];
              console.log(`CLIENT: Processing payload ${i}:`, payload);

              let parsedPayload = null;

              if (typeof payload === "string") {
                try {
                  parsedPayload = JSON.parse(payload);
                  console.log(`CLIENT: Parsed payload ${i}:`, parsedPayload);
                } catch (parseError) {
                  console.error(
                    `CLIENT: Error parsing payload ${i} JSON:`,
                    parseError
                  );
                  continue;
                }
              } else if (typeof payload === "object" && payload !== null) {
                parsedPayload = payload;
                console.log(
                  `CLIENT: Payload ${i} is already an object:`,
                  parsedPayload
                );
              }

              if (parsedPayload) {
                if (
                  parsedPayload.ragSources &&
                  Array.isArray(parsedPayload.ragSources)
                ) {
                  sourcesToSet = parsedPayload.ragSources;
                  console.log(
                    `CLIENT: Updated RAG sources from payload ${i}:`,
                    sourcesToSet
                  );
                }

                if (parsedPayload.groundingMetadata) {
                  groundingToSet = parsedPayload.groundingMetadata;
                  console.log(
                    `CLIENT: Updated grounding metadata from payload ${i}:`,
                    groundingToSet
                  );
                }
              }
            }
          } else {
            console.log(
              "CLIENT: unstable_data is not an array or is empty:",
              typeof unstableDataArray,
              unstableDataArray
            );
          }
        } catch (error) {
          console.error("CLIENT: Error processing message data:", error);
        }

        // Update state with the retrieved data
        console.log("CLIENT: Setting message sources:", sourcesToSet);
        setMessageSources((prev) => {
          const newMap = new Map(prev);
          newMap.set(message.id, sourcesToSet);
          return newMap;
        });

        console.log("CLIENT: Setting message grounding:", groundingToSet);
        setMessageGrounding((prev) => {
          const newMap = new Map(prev);
          newMap.set(message.id, groundingToSet);
          return newMap;
        });
      }
    },
  });

  useEffect(() => {
    const updateChatContextFromStorage = () => {
      const storedId = localStorage.getItem("chatContextId");
      const storedName = localStorage.getItem("chatContextName");
      const newName = storedName || "All Documents";
      const newId = storedId && storedId !== "null" ? storedId : undefined;

      setCurrentChatContextName(newName);
      setCurrentChatContextId(newId);
    };
    updateChatContextFromStorage();
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === "chatContextId" || event.key === "chatContextName") {
        updateChatContextFromStorage();
      }
    };
    window.addEventListener("storage", handleStorageChange);
    return () => {
      window.removeEventListener("storage", handleStorageChange);
    };
  }, []);

  const chatPageContextValue = useMemo(
    () => ({
      messageSources,
      messageGrounding,
      isSearchEnabled,
      setIsSearchEnabled,
    }),
    [messageSources, messageGrounding, isSearchEnabled]
  ); // Removed setIsSearchEnabled from deps as it's stable

  return (
    <PDFViewerProvider>
      <AssistantRuntimeProvider runtime={runtime}>
        <ChatPageContext.Provider value={chatPageContextValue}>
          <ChatPageLayout />
        </ChatPageContext.Provider>
      </AssistantRuntimeProvider>
    </PDFViewerProvider>
  );
}

// Split-screen layout component
const ChatPageLayout: FC = () => {
  const { state } = usePDFViewer();
  const thread = useThread();
  
  // Check if we should show the prompt sidebar (only when chat is empty)
  const showPromptSidebar = thread.messages.length === 0;

  return (
    <div className="flex h-screen bg-[#191a1a] text-foreground">
      {/* Sidebar - only show when chat is empty */}
      {showPromptSidebar && (
        <div className="absolute left-[15vw] top-80 w-80 z-10">
          <FlowingPrompts />
        </div>
      )}

      {/* Main Chat Area with Thread Context */}
      <div 
        className={cn(
          "flex flex-col transition-all duration-300 ease-in-out",
          showPromptSidebar && !state.isOpen ? "flex-1" : // Full remaining width when sidebar is shown and PDF closed
          showPromptSidebar && state.isOpen ? "w-[calc(100%-40%-320px)]" : // Reduced width when both sidebar and PDF are open
          !showPromptSidebar && state.isOpen ? "w-[60%]" : // Normal PDF layout when no sidebar
          "w-full" // Full width when no sidebar and no PDF
        )}
      >
        <ThreadPrimitive.Root
          className="box-border flex-1 bg-[#191a1a] overflow-hidden"
          style={{ ["--thread-max-width" as string]: "42rem" }}
        >
          <div className="flex h-full">
            {/* Chat Content Area */}
            <div className="flex-1 flex flex-col">
              <ThreadPrimitive.Empty>
                <ThreadWelcome />
              </ThreadPrimitive.Empty>
              <ThreadPrimitive.If empty={false}>
                <ThreadPrimitive.Viewport className="flex h-full flex-col items-center overflow-y-scroll scroll-smooth bg-inherit px-4 pt-8">
                  <ThreadPrimitive.Messages
                    components={{
                      UserMessage: PerplexityUserMessage,
                      AssistantMessage: PerplexityAssistantMessage,
                    }}
                  />
                  <div className="min-h-8 flex-grow" />
                  <div className="sticky bottom-0 mt-3 flex w-full max-w-[var(--thread-max-width)] flex-col items-center justify-end rounded-t-lg bg-inherit pb-4">
                    <ThreadScrollToBottom />
                    <Composer />
                  </div>
                </ThreadPrimitive.Viewport>
              </ThreadPrimitive.If>
            </div>
          </div>
        </ThreadPrimitive.Root>
      </div>

      {/* PDF Viewer Panel */}
      <div 
        className={cn(
          "transition-all duration-300 ease-in-out overflow-hidden",
          state.isOpen ? "w-[40%]" : "w-0"
        )}
      >
        <PDFViewer />
      </div>
    </div>
  );
};

interface ChatPageContextType {
  messageSources: MessageSourcesMap;
  messageGrounding: MessageGroundingMap;
  isSearchEnabled: boolean;
  setIsSearchEnabled: React.Dispatch<React.SetStateAction<boolean>>;
}

const ChatPageContext = React.createContext<ChatPageContextType>({
  messageSources: new Map(),
  messageGrounding: new Map(),
  isSearchEnabled: false,
  setIsSearchEnabled: () => {},
});

function useChatPageContext() {
  return React.useContext(ChatPageContext);
}

const ThreadScrollToBottom: FC = () => {
  return (
    <ThreadPrimitive.ScrollToBottom asChild>
      <TooltipIconButton
        tooltip="Scroll to bottom"
        variant="outline"
        className="absolute -top-8 rounded-full disabled:invisible bg-[#202222] border-foreground/20 hover:bg-foreground/20"
      >
        <ArrowDownIcon />
      </TooltipIconButton>
    </ThreadPrimitive.ScrollToBottom>
  );
};

const ThreadWelcome: FC = () => {
  return (
    <div className="flex h-full w-full items-center justify-center bg-[#191a1a] text-white">
      <div className="flex w-full max-w-[var(--thread-max-width)] flex-grow flex-col gap-12 px-4">
        <div className="flex w-full flex-grow flex-col items-center justify-center">
          <Image
            src="/logo2.png"
            alt="Wine Logo"
            width={200}
            height={100}
            priority
            style={{ width: "auto", height: "auto" }}
          />
        </div>
        <div className="flex justify-center"> {/* Center the chat box */}
          <div className="w-full max-w-xl"> {/* Centered with better proportions */}
            <Composer />
          </div>
        </div>
      </div>
    </div>
  );
};

const Composer: FC = () => {
  const { isSearchEnabled, setIsSearchEnabled } = useChatPageContext();
  const thread = useThread();
  
  // Check if there are any messages in the conversation
  const hasMessages = thread.messages.length > 0;
  
  // Determine placeholder text based on search state and whether it's the first message
  const getPlaceholderText = () => {
    if (isSearchEnabled) {
      return hasMessages ? "Ask follow-up with web search..." : "Ask with web search...";
    }
    return hasMessages ? "Ask follow-up.." : "Ask a question..";
  };

  return (
    <div className="w-full rounded-full p-2">
      <ComposerPrimitive.Root className="focus-within:border-ring/20 flex w-full flex-wrap items-end rounded-full border border-foreground/20 bg-background px-2.5 shadow-sm transition-colors ease-in">
        <TooltipIconButton
          tooltip={isSearchEnabled ? "Disable Web Search" : "Enable Web Search"}
          variant="ghost"
          className={cn(
            "my-2.5 size-10 rounded-full p-2 transition-colors ease-in",
            isSearchEnabled
              ? "text-blue-500 hover:bg-blue-500/10"
              : "text-muted-foreground hover:text-foreground hover:bg-accent"
          )}
          onClick={() => setIsSearchEnabled(!isSearchEnabled)}
        >
          <GlobeIcon className="!size-5" />
        </TooltipIconButton>

        <ComposerPrimitive.Input
          rows={1}
          autoFocus
          placeholder={getPlaceholderText()}
          className="placeholder:text-muted-foreground max-h-40 flex-grow resize-none border-none bg-transparent px-4 py-4 text-lg outline-none focus:ring-0 disabled:cursor-not-allowed text-foreground"
          submitOnEnter
        />
        <div className="flex gap-3">
          <ComposerAction />
        </div>
      </ComposerPrimitive.Root>
    </div>
  );
};

const ComposerAction: FC = () => {
  return (
    <>
      <ThreadPrimitive.If running={false}>
        <ComposerPrimitive.Send asChild>
          <TooltipIconButton
            tooltip="Send"
            variant="default"
            className="my-2.5 size-10 rounded-full p-2 transition-opacity ease-in bg-[#8b2c2c] hover:bg-[#b54545] text-white"
            type="button"
          >
            <ArrowUpIcon className="!size-5" />
          </TooltipIconButton>
        </ComposerPrimitive.Send>
      </ThreadPrimitive.If>
      <ThreadPrimitive.If running>
        <ComposerPrimitive.Cancel asChild>
          <TooltipIconButton
            tooltip="Cancel"
            variant="default"
            className="my-2.5 size-10 rounded-full p-2 transition-opacity ease-in bg-red-600 hover:bg-red-700 text-white"
          >
            <CircleStopIcon />
          </TooltipIconButton>
        </ComposerPrimitive.Cancel>
      </ThreadPrimitive.If>
    </>
  );
};

const PerplexityUserMessage: FC = () => {
  return (
    <MessagePrimitive.Root className="relative w-full max-w-[var(--thread-max-width)] gap-y-2 py-4 text-white">
      <div className="text-foreground break-words rounded-3xl py-2.5 text-xl md:text-2xl">
        <MessagePrimitive.Content />
      </div>
    </MessagePrimitive.Root>
  );
};

const Citation: FC<{
  num: number;
  source?: BlendedSource;
}> = ({ num, source }) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const { openPDFViewer } = usePDFViewer();

  const isWebSource = source?.type === "web";
  const isDocumentSource = source?.type === "rag";
  const tooltipText = source
    ? `${source.name}${source.pageNumber ? 
        (source.additionalPages && source.additionalPages.length > 0 
          ? ` (Pages ${source.pageNumber}, ${source.additionalPages.join(", ")})`
          : ` (Page ${source.pageNumber})`) 
        : ""}${source.content ? ": " + source.content : ""}`
    : "Source not available";

  const handleClick = () => {
    console.log("Citation clicked:", { source, isWebSource, isDocumentSource });
    if (isWebSource && source?.uri) {
      window.open(source.uri, "_blank", "noopener,noreferrer");
    } else if (isDocumentSource && source?.documentId && source?.name) {
      // Parse document ID as number - for now we'll use a simple approach
      const docId = parseInt(source.documentId);
      console.log("Opening PDF viewer with docId:", docId, "name:", source.name, "pageNumber:", source.pageNumber);
      if (!isNaN(docId)) {
        openPDFViewer(docId, source.name, source.pageNumber);
      } else {
        console.error("Invalid document ID:", source.documentId);
      }
    } else {
      console.log("Click conditions not met:", {
        isDocumentSource,
        documentId: source?.documentId,
        name: source?.name,
        fullSource: source
      });
    }
  };

  return (
    <span className="whitespace-nowrap relative inline-block">
      <a
        className={`mr-[2px] citation ml-xs inline cursor-pointer ${
          isWebSource ? "hover:text-blue-300" : ""
        } ${
          isDocumentSource ? "hover:text-green-300" : ""
        }`}
        data-state={showTooltip ? "open" : "closed"}
        aria-label={tooltipText}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        onClick={handleClick}
      >
        <span className="relative select-none align-middle -top-px font-sans text-base text-textMain dark:text-textMainDark selection:bg-super/50 selection:text-textMain dark:selection:bg-superDuper/10 dark:selection:text-superDark">
          <span
            className={`min-w-[1rem] rounded-[0.3125rem] text-center align-middle font-mono text-[0.6rem] tabular-nums py-[0.1875rem] px-[0.3rem] border ${
              isWebSource
                ? "bg-blue-600 border-blue-500 text-white hover:bg-blue-700"
                : isDocumentSource
                ? "bg-green-600 border-green-500 text-white hover:bg-green-700"
                : "hover:bg-super dark:hover:bg-superDark dark:hover:text-backgroundDark hover:text-white border-borderMain/50 dark:border-borderMainDark/50 bg-offsetPlus dark:bg-offsetPlusDark"
            }`}
          >
            {num}
          </span>
        </span>
      </a>
      {showTooltip && (
        <span
          className="absolute left-0 bottom-full mb-2 p-3 bg-gray-800 text-white text-xs rounded-md shadow-lg z-50 w-64 overflow-hidden block"
          style={{ minWidth: "250px" }}
        >
          <span className="flex items-center gap-2 mb-1">
            <span
              className={`px-1.5 py-0.5 rounded text-xs font-semibold ${
                isWebSource
                  ? "bg-blue-600 text-white"
                  : isDocumentSource
                  ? "bg-green-600 text-white"
                  : "bg-gray-600 text-white"
              }`}
            >
              {isWebSource ? "WEB" : "DOC"}
            </span>
            <span className={`font-semibold truncate flex-1 ${
              isWebSource ? "text-blue-300" : isDocumentSource ? "text-green-300" : "text-blue-300"
            }`}>
              {source?.name}
            </span>
          </span>
          {isDocumentSource && (
            <span className="text-green-400 text-xs mb-1 block">
              Click to view document
            </span>
          )}
          {isWebSource && source?.uri && (
            <span className="text-blue-400 text-xs mb-1 truncate block">
              {source.uri}
            </span>
          )}
          <span className="break-words whitespace-normal overflow-y-auto max-h-40 block">
            {source?.content || "Source details not available."}
          </span>
        </span>
      )}
    </span>
  );
};

const MarkdownWithCitations: FC<{
  content: string;
  sources: BlendedSource[];
}> = ({ content, sources }) => {
  if (!content) return null;

  const processChildrenForCitations = (
    nodes: React.ReactNode[]
  ): React.ReactNode[] => {
    return nodes.flatMap((node, idx) => {
      if (typeof node === "string") {
        const parts: React.ReactNode[] = [];
        let lastIndex = 0;
        const citationRegex = /(\[\d+(?:,\s*\d+)*\])/g;
        let match: RegExpExecArray | null;
        while ((match = citationRegex.exec(node)) !== null) {
          if (match.index > lastIndex) {
            parts.push(node.substring(lastIndex, match.index));
          }
          const citationNumbers = match[1]!
            .substring(1, match[1]!.length - 1)
            .split(",")
            .map((numStr) => parseInt(numStr.trim(), 10));

          citationNumbers.forEach((num, i) => {
            // Only render citations that exist in our sources array
            if (num > 0 && num <= sources.length) {
              const source = sources[num - 1];
              if (source) {
                parts.push(
                  <Citation
                    key={`cite-idx${idx}-match${match!.index}-i${i}`}
                    num={num}
                    source={source}
                  />
                );
              }
            }
            // Skip rendering invalid citation numbers entirely instead of showing grayed out ones
          });
          lastIndex = citationRegex.lastIndex;
        }
        if (lastIndex < node.length) {
          parts.push(node.substring(lastIndex));
        }
        return parts;
      }
      return node;
    });
  };

  const customComponents = {
    p: (props: any) => {
      const { children } = props;
      return (
        <p className="mb-4 leading-7 text-white">
          {processChildrenForCitations(React.Children.toArray(children))}
        </p>
      );
    },
    h1: (props: any) => (
      <h1 className="text-2xl font-bold mb-4 mt-6 text-white">
        {props.children}
      </h1>
    ),
    h2: (props: any) => (
      <h2 className="text-xl font-bold mb-3 mt-5 text-white">
        {props.children}
      </h2>
    ),
    h3: (props: any) => (
      <h3 className="text-lg font-bold mb-3 mt-4 text-white">
        {props.children}
      </h3>
    ),
    h4: (props: any) => (
      <h4 className="text-base font-bold mb-2 mt-3 text-white">
        {props.children}
      </h4>
    ),
    h5: (props: any) => (
      <h5 className="text-sm font-bold mb-2 mt-3 text-white">
        {props.children}
      </h5>
    ),
    h6: (props: any) => (
      <h6 className="text-xs font-bold mb-2 mt-3 text-white">
        {props.children}
      </h6>
    ),
    strong: (props: any) => (
      <strong className="font-bold text-white">{props.children}</strong>
    ),
    em: (props: any) => <em className="italic text-white">{props.children}</em>,
    ul: (props: any) => (
      <ul className="list-disc list-inside mb-4 space-y-1 text-white pl-4">
        {props.children}
      </ul>
    ),
    ol: (props: any) => (
      <ol className="list-decimal list-inside mb-4 space-y-1 text-white pl-4">
        {props.children}
      </ol>
    ),
    li: (props: any) => (
      <li className="mb-1 text-white leading-6">
        {processChildrenForCitations(React.Children.toArray(props.children))}
      </li>
    ),
    code: (props: any) => {
      const { node, inline, className, children, ...rest } = props;
      if (inline) {
        return (
          <code
            className="bg-gray-700 text-gray-200 px-1.5 py-0.5 rounded text-sm font-mono"
            {...rest}
          >
            {children}
          </code>
        );
      }
      return (
        <code
          className="block bg-gray-800 text-gray-200 p-3 rounded-md text-sm font-mono overflow-x-auto mb-4"
          {...rest}
        >
          {children}
        </code>
      );
    },
    pre: (props: any) => (
      <pre className="bg-gray-800 text-gray-200 p-4 rounded-md overflow-x-auto mb-4 border border-gray-600">
        {props.children}
      </pre>
    ),
    blockquote: (props: any) => (
      <blockquote className="border-l-4 border-blue-500 pl-4 py-2 mb-4 italic text-gray-300 bg-gray-800/50 rounded-r">
        {props.children}
      </blockquote>
    ),
    table: (props: any) => (
      <div className="overflow-x-auto mb-4">
        <table className="min-w-full border border-gray-600 rounded-lg overflow-hidden">
          {props.children}
        </table>
      </div>
    ),
    thead: (props: any) => (
      <thead className="bg-gray-700">{props.children}</thead>
    ),
    tbody: (props: any) => (
      <tbody className="bg-gray-800">{props.children}</tbody>
    ),
    tr: (props: any) => (
      <tr className="border-b border-gray-600">{props.children}</tr>
    ),
    th: (props: any) => (
      <th className="px-4 py-2 text-left font-bold text-white border-r border-gray-600 last:border-r-0">
        {props.children}
      </th>
    ),
    td: (props: any) => (
      <td className="px-4 py-2 text-white border-r border-gray-600 last:border-r-0">
        {props.children}
      </td>
    ),
    a: (props: any) => (
      <a
        href={props.href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-400 hover:text-blue-300 underline"
      >
        {props.children}
      </a>
    ),
    hr: () => <hr className="my-6 border-gray-600" />,
  };

  return (
    <div className="aui-md">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={customComponents}>
        {content}
      </ReactMarkdown>
    </div>
  );
};

const PerplexityAssistantMessage: FC = () => {
  const message = useMessage();
  const { messageSources, messageGrounding } = useChatPageContext();
  const { openPDFViewer } = usePDFViewer();

  let messageText = "";
  if (message.content) {
    const textPart =
      Array.isArray(message.content) &&
      message.content.find((part) => part.type === "text" && "text" in part);

    if (textPart && "text" in textPart) {
      messageText = textPart.text as string;
    }
  }

  const ragSources = messageSources.get(message.id) || [];
  const grounding = messageGrounding.get(message.id);

  console.log("RAG Sources for message:", message.id, ragSources);

  // Create blended sources combining RAG and web sources
  const blendedSources: BlendedSource[] = [
    // Add RAG sources first
    ...ragSources.map(
      (source): BlendedSource => {
        const blendedSource = {
          type: "rag" as const,
          content: source.content,
          name: source.name || "Document",
          documentId: source.document_id?.toString(), // Pass through the document ID
          pageNumber: source.page_number, // Pass through the page number
          additionalPages: source.additional_pages, // Pass through additional pages
        };
        console.log("Creating blended source:", blendedSource);
        return blendedSource;
      }
    ),
    // Add web sources from grounding metadata
    ...(grounding?.groundingChunks?.map(
      (chunk, index): BlendedSource => ({
        type: "web",
        content: chunk.web?.title || "Web search result",
        name: chunk.web?.title || `Web Source ${index + 1}`,
        uri: chunk.web?.uri,
      })
    ) || []),
  ];

  // Extract which citation numbers were actually used in the text
  const getActuallyCitedSources = (text: string, sources: BlendedSource[]) => {
    const citedNumbers = new Set<number>();
    const citationRegex = /\[(\d+(?:,\s*\d+)*)\]/g;
    let match;
    
    while ((match = citationRegex.exec(text)) !== null) {
      const numbers = match[1].split(',').map(num => parseInt(num.trim(), 10));
      numbers.forEach(num => {
        if (num > 0 && num <= sources.length) {
          citedNumbers.add(num);
        }
      });
    }
    
    return Array.from(citedNumbers)
      .sort((a, b) => a - b)
      .map(num => ({ source: sources[num - 1], originalIndex: num }))
      .filter(item => item.source);
  };

  const actuallyCitedSources = getActuallyCitedSources(messageText, blendedSources);
  const shouldShowSources = actuallyCitedSources.length > 0;

  return (
    <MessagePrimitive.Root className="relative grid w-full max-w-[var(--thread-max-width)] grid-cols-[auto_1fr] grid-rows-[auto_1fr] py-4 text-white">
      <div className="text-foreground col-start-1 col-span-2 row-start-1 my-1.5 max-w-[calc(var(--thread-max-width)*0.95)] break-words leading-7">
        <div className="w-full h-px bg-gray-700 opacity-50 mb-4" />

        {messageText && (
          <MarkdownWithCitations
            content={messageText}
            sources={blendedSources}
          />
        )}

        {!messageText && (
          <MessagePrimitive.Content components={{ Text: MarkdownText }} />
        )}

        {shouldShowSources && (
          <div className="mt-6 pt-4 border-t border-gray-700/30">
            <div className="flex flex-wrap gap-3">
              {actuallyCitedSources.map(({ source, originalIndex }, displayIndex) => (
                <div key={`source-${displayIndex}`} className="group relative">
                  {source.type === "web" && source.uri ? (
                    <a
                      href={source.uri}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-600/50 bg-gray-800/30 hover:bg-gray-700/50 transition-colors duration-200 cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded-full bg-blue-600/20 flex items-center justify-center">
                          <svg
                            className="w-2.5 h-2.5 text-blue-400"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0" />
                            <path d="M3.6 9h16.8" />
                            <path d="M3.6 15h16.8" />
                            <path d="M11.5 3a17 17 0 0 0 0 18" />
                            <path d="M12.5 3a17 17 0 0 1 0 18" />
                          </svg>
                        </div>
                        <span className="text-xs font-medium text-gray-300 group-hover:text-white transition-colors">
                          [{originalIndex}]
                        </span>
                      </div>
                      <span className="text-xs text-gray-400 group-hover:text-gray-300 transition-colors truncate max-w-[200px]">
                        {source.name}
                      </span>
                    </a>
                  ) : (
                    <div 
                      className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-600/50 bg-gray-800/30 hover:bg-gray-700/50 transition-colors duration-200 cursor-pointer"
                      onClick={() => {
                        console.log("Source card clicked:", source);
                        if (source.type === "rag" && source.documentId && source.name) {
                          const docId = parseInt(source.documentId);
                          console.log("Opening PDF viewer from source card - docId:", docId, "name:", source.name, "pageNumber:", source.pageNumber);
                          if (!isNaN(docId)) {
                            openPDFViewer(docId, source.name, source.pageNumber);
                          } else {
                            console.error("Invalid document ID from source card:", source.documentId);
                          }
                        } else {
                          console.log("Source card click conditions not met:", {
                            type: source.type,
                            documentId: source.documentId,
                            name: source.name
                          });
                        }
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded-full bg-green-600/20 flex items-center justify-center">
                          <svg
                            className="w-2.5 h-2.5 text-green-400"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14,2 14,8 20,8" />
                            <line x1="16" y1="13" x2="8" y2="13" />
                            <line x1="16" y1="17" x2="8" y2="17" />
                            <polyline points="10,9 9,9 8,9" />
                          </svg>
                        </div>
                        <span className="text-xs font-medium text-gray-300 group-hover:text-white transition-colors">
                          [{originalIndex}]
                        </span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-xs text-gray-400 group-hover:text-gray-300 transition-colors truncate max-w-[200px]">
                          {source.name.replace(".pdf", "")}
                        </span>
                        {source.type === "rag" && source.pageNumber && (
                          <span className="text-xs text-gray-500 group-hover:text-gray-400 transition-colors">
                            {source.additionalPages && source.additionalPages.length > 0 
                              ? `Pages ${source.pageNumber}, ${source.additionalPages.join(", ")}`
                              : `Page ${source.pageNumber}`
                            }
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <AssistantActionBar />
      <BranchPicker className="col-start-1 col-span-2 row-start-2 -ml-2 mr-2 mt-2" />
    </MessagePrimitive.Root>
  );
};

const AssistantActionBar: FC = () => {
  return (
    <ActionBarPrimitive.Root
      hideWhenRunning
      autohide="not-last"
      autohideFloat="single-branch"
      className="text-muted-foreground col-start-1 col-span-2 row-start-2 mt-2 flex gap-1"
    >
      <ActionBarPrimitive.Copy asChild>
        <TooltipIconButton
          tooltip="Copy"
          className="text-gray-400 hover:text-white"
        >
          <MessagePrimitive.If copied>
            <CheckIcon />
          </MessagePrimitive.If>
          <MessagePrimitive.If copied={false}>
            <CopyIcon />
          </MessagePrimitive.If>
        </TooltipIconButton>
      </ActionBarPrimitive.Copy>
      <ThreadPrimitive.If running={false}>
        <ActionBarPrimitive.Reload asChild>
          <TooltipIconButton
            tooltip="Refresh"
            className="text-gray-400 hover:text-white"
          >
            <RefreshCwIcon />
          </TooltipIconButton>
        </ActionBarPrimitive.Reload>
      </ThreadPrimitive.If>
    </ActionBarPrimitive.Root>
  );
};

const BranchPicker: FC<BranchPickerPrimitive.Root.Props> = ({
  className,
  ...rest
}) => {
  return (
    <BranchPickerPrimitive.Root
      hideWhenSingleBranch
      className={cn(
        "text-muted-foreground inline-flex items-center text-xs",
        className
      )}
      {...rest}
    >
      <BranchPickerPrimitive.Previous asChild>
        <TooltipIconButton
          tooltip="Previous"
          className="text-gray-400 hover:text-white"
        >
          <ChevronLeftIcon />
        </TooltipIconButton>
      </BranchPickerPrimitive.Previous>
      <span className="font-medium text-gray-300 px-1">
        <BranchPickerPrimitive.Number /> / <BranchPickerPrimitive.Count />
      </span>
      <BranchPickerPrimitive.Next asChild>
        <TooltipIconButton
          tooltip="Next"
          className="text-gray-400 hover:text-white"
        >
          <ChevronRightIcon />
        </TooltipIconButton>
      </BranchPickerPrimitive.Next>
    </BranchPickerPrimitive.Root>
  );
};

const CircleStopIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 16 16"
    fill="currentColor"
    width="16"
    height="16"
    className="!size-4"
  >
    <rect width="10" height="10" x="3" y="3" rx="2" />
  </svg>
);
