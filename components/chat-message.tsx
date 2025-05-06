import React from "react";
import { type Message as AIMessage } from "@ai-sdk/react";
import {
  TooltipProvider, // Added to ensure Tooltip works correctly if it's the root
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { Card, CardContent } from "@/components/ui/card"; // Added Card and CardContent

// Define SourceChunk, used by ChatMessageProps
interface SourceChunk {
  id: string | number;
  content: string;
}

// Props for ChatMessage component
interface ChatMessageProps {
  message: AIMessage;
  sourceChunksForMessage: SourceChunk[];
}

function ChatMessage({ message, sourceChunksForMessage }: ChatMessageProps) {
  // console.log( // Commenting out console.log for cleaner output
  //   `ChatMessage ID: ${message.id}, Role: ${message.role}, Received sourceChunksForMessage:`,
  //   sourceChunksForMessage
  // );

  const sourceChunks = sourceChunksForMessage;

  const renderContentWithCitations = (content: string) => {
    if (!sourceChunks || sourceChunks.length === 0) {
      // Use ReactMarkdown for consistency if needed, or keep as <p>
      // For now, keeping as <p> to match original simple case
      return <p className="text-sm whitespace-pre-wrap">{content}</p>;
    }
    const citationRegex = /\s*\[(\d+(?:,\s*\d+)*)\]/g;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = citationRegex.exec(content)) !== null) {
      if (match.index > lastIndex) {
        parts.push(content.substring(lastIndex, match.index));
      }
      const citationNumbers = match[1]
        .split(",")
        .map((num) => parseInt(num.trim(), 10));

      const citationElements = citationNumbers.map((num, idx) => {
        const chunkIndex = num - 1;
        const chunk = sourceChunks[chunkIndex];
        if (!chunk) {
          return (
            <sup
              key={`missing-${message.id}-${num}-${idx}`}
              className="text-destructive font-bold"
            >
              [{num}]?
            </sup>
          );
        }
        return (
          <Tooltip key={`${message.id}-cite-${num}-${idx}`}>
            <TooltipTrigger asChild>
              <span className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-gray-400 text-primary-foreground text-xs font-bold cursor-pointer mx-0.5 align-middle">
                {num}
              </span>
            </TooltipTrigger>
            <TooltipContent
              side="top"
              align="start"
              className="max-w-sm w-auto p-2 bg-background border text-foreground shadow-lg rounded-md z-50" // Added z-50
            >
              <p className="text-xs whitespace-pre-wrap">
                <span className="font-semibold">
                  Source {num} (ID: {chunk.id || "N/A"}):
                </span>{" "}
                {/* Added a space for better readability */}
                {chunk.content.replace(/\u2666/g, "")}
              </p>
            </TooltipContent>
          </Tooltip>
        );
      });

      const combinedCitations: React.ReactNode[] = [];
      citationElements.forEach((elem, idx) => {
        if (idx > 0) combinedCitations.push(); // This was empty, potentially a bug, keeping as is for now.
        combinedCitations.push(elem);
      });

      parts.push(
        <span key={`cite-group-${message.id}-${match!.index}`}>
          {combinedCitations}
        </span>
      );
      lastIndex = citationRegex.lastIndex;
    }
    if (lastIndex < content.length) {
      parts.push(content.substring(lastIndex));
    }

    // The wrapping <p> for the entire message content including citations
    return (
      <p className="text-sm whitespace-pre-wrap">
        {parts.map((part, i) => (
          <React.Fragment key={i}>{part}</React.Fragment>
        ))}
      </p>
    );
  };

  return (
    <div
      className={`flex ${
        message.role === "user" ? "justify-end" : "justify-start"
      }`}
    >
      <Card
        className={`max-w-xs lg:max-w-md py-1 ${
          message.role === "user"
            ? "bg-primary text-primary-foreground"
            : "bg-muted"
        }`}
      >
        <CardContent className="py-1 px-3">
          {message.role === "assistant" ? (
            renderContentWithCitations(message.content)
          ) : (
            // For user messages, also ensure wrapping with <p> for consistency if desired,
            // or directly output content if it's always simple text.
            // Original was: <p className="text-sm whitespace-pre-wrap">{message.content}</p>
            <p className="text-sm whitespace-pre-wrap">{message.content}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default ChatMessage;
// Export SourceChunk if it's needed by other components that import ChatMessage directly,
// or if ChatArea will import it from here. For now, keeping it self-contained.
// If ChatArea needs SourceChunk, it should import it from a shared types file or here.
export type { SourceChunk }; // Exporting the type
