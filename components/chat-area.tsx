import React from "react";
import { type Message as AIMessage } from "@ai-sdk/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TooltipProvider } from "@/components/ui/tooltip";
import ChatMessage, { type SourceChunk } from "@/components/chat-message";

// Props for ChatArea component
interface ChatAreaProps {
  messages: AIMessage[];
  input: string;
  handleInputChange: (
    e:
      | React.ChangeEvent<HTMLInputElement>
      | React.ChangeEvent<HTMLTextAreaElement>
  ) => void;
  handleSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  isLoading: boolean;
  error: Error | undefined;
  messagesContainerRef: React.RefObject<HTMLDivElement | null>;
  messageChunksMap: Record<string, SourceChunk[]>;
}

const ChatArea: React.FC<ChatAreaProps> = ({
  messages,
  input,
  handleInputChange,
  handleSubmit,
  isLoading,
  error,
  messagesContainerRef,
  messageChunksMap,
}) => {
  return (
    <main className="flex-1 flex flex-col overflow-hidden">
      {/* Message list area */}
      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-4">
        <TooltipProvider delayDuration={100}>
          <div className="space-y-4">
            {messages.map((m) => {
              const chunksForThisMessage = messageChunksMap[m.id] || [];

              return (
                <ChatMessage
                  key={m.id}
                  message={m}
                  sourceChunksForMessage={chunksForThisMessage}
                />
              );
            })}
            {isLoading &&
              messages.length > 0 &&
              messages[messages.length - 1]?.role === "user" && (
                <div className="flex justify-start p-3">
                  <div className="flex space-x-1 justify-center items-center">
   
                    <div className="h-2 w-2 bg-current rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                    <div className="h-2 w-2 bg-current rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                    <div className="h-2 w-2 bg-current rounded-full animate-bounce"></div>
                  </div>
                </div>
              )}
            {error && (
              <div className="p-4 text-destructive">
                <p>Error: {error.message}</p>
              </div>
            )}
          </div>
        </TooltipProvider>
      </div>

      {/* Message input form */}
      <div className="p-4 border-t">
        <form onSubmit={handleSubmit} className="flex items-center space-x-2">
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
  );
};

export default ChatArea;
