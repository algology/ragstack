"use client";

import { useState, /*useRef,*/ useEffect } from "react"; // useRef might not be needed
// import { useChat, type Message as VercelAIMessage } from "@ai-sdk/react"; // Replaced by useChatRuntime
import React, { type FC } from "react";
import Image from "next/image"; // Removed unused import
// import Link from "next/link"; // Removed unused import
// import { Settings, Info } from "lucide-react"; // Removed unused imports
// import { ModeToggle } from "@/components/mode-toggle"; // Removed unused import
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Assistant UI Components
import {
  AssistantRuntimeProvider, // NEW
  ActionBarPrimitive,
  BranchPickerPrimitive,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useMessage, // IMPORT useMessage
  type ThreadMessage, // IMPORT ThreadMessage
  // useAssistantRuntime, // No longer needed directly for bridging
} from "@assistant-ui/react";
import { useChatRuntime } from "@assistant-ui/react-ai-sdk"; // NEW
// import type { Message as VercelAIMessage } from "ai"; // Removed unused import VercelAIMessage

import {
  ArrowDownIcon,
  ArrowRightIcon,
  ArrowUpIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyIcon,
  // PaperclipIcon, // Commented out due to attachment UI being commented
  RefreshCwIcon,
  // SparkleIcon, // Removed unused import
} from "lucide-react";

import { MarkdownText } from "@/components/assistant-ui/markdown-text";
import { TooltipIconButton } from "@/components/assistant-ui/tooltip-icon-button";
// import { // Attachment components still commented out
//   ComposerAttachments,
//   UserMessageAttachments,
// } from "@/components/assistant-ui/attachment";

// Define DocumentChunk interface based on what's expected from the backend
interface DocumentChunk {
  id?: string; // Or number, depending on your DB schema for chunks
  content: string;
  name?: string; // Document name, if available per chunk
  // Add any other relevant properties that your backend sends for each chunk
}

// For demonstration - sample sources to display in tooltips when actual sources aren't available
// const DEMO_SOURCES: DocumentChunk[] = [
//   {
//     id: "1",
//     content:
//       "Wine is an alcoholic drink made from fermented grapes. Yeast consumes the sugar in the grapes and converts it to ethanol and carbon dioxide, releasing heat in the process.",
//     name: "Wine_Overview.pdf",
//   },
//   {
//     id: "2",
//     content:
//       "The earliest evidence of a wine production facility is the Areni-1 winery in Armenia and is at least 6,100 years old.",
//     name: "Wine_History.txt",
//   },
//   {
//     id: "3",
//     content:
//       "Wine grapes grow almost exclusively between 30 and 50 degrees latitude north and south of the equator.",
//     name: "Wine_Geography.pdf",
//   },
//   {
//     id: "4",
//     content:
//       "Wines made from fruits other than grapes include rice wine, pomegranate wine, apple wine and elderberry wine.",
//     name: "Wine_Varieties.txt",
//   },
//   {
//     id: "5",
//     content:
//       "Wine has been produced for thousands of years, with evidence of ancient wine production in Georgia from 8000 BC, Iran from 7000 BC, and Sicily from 4000 BC.",
//     name: "Wine_History.txt",
//   },
// ];

// Message sources map type
type MessageSourcesMap = Map<string, DocumentChunk[]>;

// Remove ChatErrorDisplay as it is unused
// const ChatErrorDisplay: FC<{ error: Error | undefined }> = ({ error }) => {
//   if (!error) return null;
//   return (
//     <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
//       <strong className="font-bold">Error:</strong>
//       <span className="block sm:inline"> {error.message}</span>
//     </div>
//   );
// };

export default function ChatPage() {
  const [currentChatContextName, setCurrentChatContextName] =
    useState<string>("All Documents");
  const [currentChatContextId, setCurrentChatContextId] = useState<
    string | undefined
  >(undefined);

  // Add state to store citation sources per message
  const [messageSources, setMessageSources] = useState<MessageSourcesMap>(
    new Map()
  );

  const runtime = useChatRuntime({
    api: "/api/chat",
    initialMessages: [], // Start with empty, or load from history if implemented
    body: {
      documentId: currentChatContextId, // This will be the initial value
      documentName:
        currentChatContextName === "All Documents"
          ? undefined
          : currentChatContextName,
    },
    onFinish: (message: ThreadMessage) => {
      if (message.role === "assistant") {
        console.log(
          "CLIENT: Assistant message finished. Message ID:",
          message.id
        );
        // Log the entire incoming message object to inspect its structure
        console.log(
          "CLIENT: Full assistant message object in onFinish:",
          JSON.stringify(message, null, 2) // Keep this log for now, it's useful
        );

        try {
          let sourcesToSet: DocumentChunk[] | undefined = undefined;

          // Access sources from message.metadata.unstable_data
          if (
            message.metadata &&
            (message.metadata as any).unstable_data &&
            Array.isArray((message.metadata as any).unstable_data)
          ) {
            const potentialSources = (message.metadata as any)
              .unstable_data as any[];
            // Basic check to see if the first item looks like a DocumentChunk
            if (
              potentialSources.length > 0 &&
              typeof potentialSources[0] === "object" &&
              potentialSources[0] !== null &&
              "content" in potentialSources[0] && // Ensure 'content' property exists
              ("name" in potentialSources[0] || "id" in potentialSources[0]) // Ensure 'name' or 'id' exists
            ) {
              console.log(
                "CLIENT: Found sources in message.metadata.unstable_data:",
                JSON.stringify(potentialSources, null, 2)
              );
              // Ensure all required fields for DocumentChunk are present or provide defaults
              sourcesToSet = potentialSources.map((src) => ({
                id: src.id?.toString(), // Ensure id is string, if it exists
                content: src.content,
                name: src.name,
                // similarity: src.similarity, // if you add similarity to DocumentChunk
              })) as DocumentChunk[];
            } else if (potentialSources.length === 0) {
              console.log(
                "CLIENT: message.metadata.unstable_data is an empty array."
              );
              sourcesToSet = []; // Explicitly set to empty array for this message
            } else {
              console.warn(
                "CLIENT: Items in message.metadata.unstable_data do not look like DocumentChunk objects.",
                JSON.stringify(potentialSources[0], null, 2) // Log the first item for inspection
              );
            }
          } else {
            console.warn(
              "CLIENT: message.metadata.unstable_data is missing or not an array."
            );
          }

          if (sourcesToSet) {
            console.log(
              "CLIENT: Setting messageSources with data from message.metadata.unstable_data."
            );
            setMessageSources((prevMap) => {
              const newMap = new Map(prevMap);
              newMap.set(message.id, sourcesToSet!);
              console.log(
                `CLIENT: Updated messageSources map for message ${message.id}. New map size: ${newMap.size}`
              );
              return newMap;
            });
          } else {
            console.warn(
              "CLIENT: No processable sources found in message.metadata.unstable_data. Citations may not work."
            );
            // Optionally, set empty sources for this message if none are found
            setMessageSources((prevMap) => {
              const newMap = new Map(prevMap);
              if (!newMap.has(message.id)) {
                // Avoid overwriting if already set by a previous logic path (though unlikely now)
                newMap.set(message.id, []);
                console.log(
                  `CLIENT: Set empty sources for message ${message.id} as fallback.`
                );
              }
              return newMap;
            });
          }
        } catch (e) {
          console.error(
            "CLIENT: Error processing message object in onFinish:",
            e
          );
        }
      }
    },
    // onError can be defined here if needed for logging/side-effects
  });

  // EFFECT TO READ FROM LOCALSTORAGE AND UPDATE CHAT CONTEXT
  // This effect will now also need to re-initialize or update the runtime if context changes.
  // Ideally, useChatRuntime would provide a way to update its body reactively.
  // For now, we rely on the initial body config. If useChatRuntime internally uses useState for body,
  // it won't pick up changes to currentChatContextId/Name after initialization this way.
  // Let's assume for now the initial setup is what we have, and reactive body updates are a future enhancement
  // or handled differently by the library (e.g. if runtime.setBody() existed).
  useEffect(() => {
    const updateChatContextFromStorage = () => {
      const storedId = localStorage.getItem("chatContextId");
      const storedName = localStorage.getItem("chatContextName");
      const newName = storedName || "All Documents";
      const newId = storedId && storedId !== "null" ? storedId : undefined;

      setCurrentChatContextName(newName);
      setCurrentChatContextId(newId);

      // IMPORTANT: To make useChatRuntime reactive to body changes,
      // you might need to pass these as props to a child component that then calls useChatRuntime,
      // or use a key on AssistantRuntimeProvider to force re-initialization.
      // The current setup will only use the initial values of currentChatContextId/Name.
      // For this iteration, we'll update the state, but the runtime might not reflect it immediately
      // without a mechanism to inform it or re-create it.
      // A common pattern if the hook doesn't support dynamic body updates is to update a `key` prop on the Provider.
      // runtime.updateChatBody({ documentId: newId, documentName: newName === "All Documents" ? undefined : newName }); // If such a method existed
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
  }, []); // Empty dependency array means this runs once, subsequent changes to localStorage will update state but may not update runtime body

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {/* Pass messageSources as a prop to make it available throughout the component tree */}
      <ChatPageContext.Provider value={{ messageSources }}>
        <div className="flex flex-col h-screen bg-background text-foreground">
          <ThreadPrimitive.Root
            className="box-border flex-1 bg-[#191a1a] overflow-hidden"
            style={{ ["--thread-max-width" as string]: "42rem" }}
          >
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
          </ThreadPrimitive.Root>
        </div>
      </ChatPageContext.Provider>
    </AssistantRuntimeProvider>
  );
}

// Create a context to pass the messageSources Map down to child components
interface ChatPageContextType {
  messageSources: MessageSourcesMap;
}

const ChatPageContext = React.createContext<ChatPageContextType>({
  messageSources: new Map(),
});

// Hook to access the ChatPageContext
function useChatPageContext() {
  return React.useContext(ChatPageContext);
}

// --- Perplexity Style Components ---

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

// ThreadWelcome now accepts no runtime props, uses context for ComposerPrimitives
const ThreadWelcome: FC = () => {
  return (
    <div className="flex h-full w-full items-center justify-center bg-[#191a1a] text-white">
      <div className="flex w-full max-w-[var(--thread-max-width)] flex-grow flex-col gap-12 px-4">
        <div className="flex w-full flex-grow flex-col items-center justify-center">
          <Image src="/logo2.png" alt="Wine Logo" width={200} height={100} />
        </div>
        <ComposerPrimitive.Root className="focus-within:ring-border/20 w-full rounded-lg border border-foreground/20 bg-[#202222] px-2 shadow-sm outline-none transition-all duration-200 focus-within:ring-1 focus:outline-none">
          <ComposerPrimitive.Input
            rows={1}
            autoFocus
            placeholder="Ask anything..."
            className="placeholder:text-muted-foreground max-h-40 w-full flex-grow resize-none border-none bg-transparent px-2 py-4 text-lg outline-none focus:ring-0 disabled:cursor-not-allowed text-white"
            submitOnEnter
          />
          <div className="mx-1.5 flex gap-2">
            <div className="flex-grow" />
            <ComposerPrimitive.Send asChild>
              <TooltipIconButton
                className="my-2.5 size-8 rounded-full p-2 transition-opacity bg-[#8b2c2c] hover:bg-[#b54545] text-white"
                tooltip="Send"
                variant="default"
                type="button"
              >
                <ArrowRightIcon />
              </TooltipIconButton>
            </ComposerPrimitive.Send>
          </div>
        </ComposerPrimitive.Root>
      </div>
    </div>
  );
};

// Composer now accepts no runtime props, uses context for ComposerPrimitives
const Composer: FC = () => {
  return (
    <div className="bg-foreground/5 w-full rounded-full p-2">
      <ComposerPrimitive.Root className="focus-within:border-ring/20 flex w-full flex-wrap items-end rounded-full border border-foreground/20 bg-[#202222] px-2.5 shadow-sm transition-colors ease-in">
        <ComposerPrimitive.Input
          rows={1}
          autoFocus
          placeholder="Ask follow-up"
          className="placeholder:text-muted-foreground max-h-40 flex-grow resize-none border-none bg-transparent px-4 py-4 text-lg outline-none focus:ring-0 disabled:cursor-not-allowed text-white"
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

// Custom Citation component with visible tooltip
const Citation: FC<{
  num: number;
  source?: DocumentChunk;
}> = ({ num, source }) => {
  const [showTooltip, setShowTooltip] = useState(false);

  const displaySource = source;
  const tooltipText = displaySource
    ? `${displaySource.name ? displaySource.name + ": " : ""}${
        displaySource.content
      }`
    : "Source not available"; // Fallback text if source is undefined

  return (
    <span className="whitespace-nowrap relative inline-block">
      <a
        className="mr-[2px] citation ml-xs inline cursor-pointer"
        data-state={showTooltip ? "open" : "closed"}
        aria-label={tooltipText}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        <span className="relative select-none align-middle -top-px font-sans text-base text-textMain dark:text-textMainDark selection:bg-super/50 selection:text-textMain dark:selection:bg-superDuper/10 dark:selection:text-superDark">
          <span className="hover:bg-super dark:hover:bg-superDark dark:hover:text-backgroundDark min-w-[1rem] rounded-[0.3125rem] text-center align-middle font-mono text-[0.6rem] tabular-nums hover:text-white py-[0.1875rem] px-[0.3rem] border border-borderMain/50 dark:border-borderMainDark/50 bg-offsetPlus dark:bg-offsetPlusDark">
            {num}
          </span>
        </span>
      </a>

      {/* Custom tooltip that's visible on hover */}
      {showTooltip && (
        <span
          className="absolute left-0 bottom-full mb-2 p-3 bg-gray-800 text-white text-xs rounded-md shadow-lg z-50 w-64 overflow-hidden block"
          style={{ minWidth: "250px" }}
        >
          {displaySource?.name && (
            <span className="font-semibold mb-1 text-blue-300 truncate block">
              {displaySource.name}
            </span>
          )}
          <span className="break-words whitespace-normal overflow-y-auto max-h-40 block">
            {displaySource?.content || "Source details not available."}
          </span>
        </span>
      )}
    </span>
  );
};

const MarkdownWithCitations: FC<{
  content: string;
  sources: DocumentChunk[];
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
            .substring(1, match[1]!.length - 1) // Remove brackets
            .split(",")
            .map((numStr) => parseInt(numStr.trim(), 10));

          citationNumbers.forEach((num, i) => {
            const source = sources[num - 1]; // 1-indexed to 0-indexed
            parts.push(
              <Citation
                key={`cite-idx${idx}-match${match!.index}-i${i}`}
                num={num}
                source={source}
              />
            );
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
    // Paragraphs with citation processing
    p: (props: any) => {
      const { children } = props;
      return (
        <p className="mb-4 leading-7 text-white">
          {processChildrenForCitations(React.Children.toArray(children))}
        </p>
      );
    },

    // Headings
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

    // Text formatting
    strong: (props: any) => (
      <strong className="font-bold text-white">{props.children}</strong>
    ),
    em: (props: any) => <em className="italic text-white">{props.children}</em>,

    // Lists
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

    // Code
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

    // Blockquotes
    blockquote: (props: any) => (
      <blockquote className="border-l-4 border-blue-500 pl-4 py-2 mb-4 italic text-gray-300 bg-gray-800/50 rounded-r">
        {props.children}
      </blockquote>
    ),

    // Tables
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

    // Links
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

    // Horizontal rule
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
  const { messageSources } = useChatPageContext();

  let messageText = "";
  if (message.content) {
    const textPart =
      Array.isArray(message.content) &&
      message.content.find((part) => part.type === "text" && "text" in part);

    if (textPart && "text" in textPart) {
      messageText = textPart.text as string;
    }
  }

  const sources = messageSources.get(message.id) || [];

  return (
    <MessagePrimitive.Root className="relative grid w-full max-w-[var(--thread-max-width)] grid-cols-[auto_1fr] grid-rows-[auto_1fr] py-4 text-white">
      <div className="text-foreground col-start-1 col-span-2 row-start-1 my-1.5 max-w-[calc(var(--thread-max-width)*0.95)] break-words leading-7">
        <div className="w-full h-px bg-gray-700 opacity-50 mb-4" />

        {/* Use the new MarkdownWithCitations component */}
        {messageText && (
          <MarkdownWithCitations content={messageText} sources={sources} />
        )}

        {/* Fallback or if content is not string, MessagePrimitive.Content might handle it */}
        {!messageText && (
          <MessagePrimitive.Content components={{ Text: MarkdownText }} />
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
