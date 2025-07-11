"use client";

import React from "react";
import { useThread, ThreadPrimitive, ComposerPrimitive } from "@assistant-ui/react";
import { cn } from "@/lib/utils";
import { ChevronRightIcon, GlobeIcon, ArrowUpIcon } from "lucide-react";
import { TooltipIconButton } from "@/components/assistant-ui/tooltip-icon-button";

const WINE_INDUSTRY_PROMPTS = [
  "What is smoke taint and how does it affect wine quality?",
  "How can I treat smoke-affected grapes before fermentation?",
  "What are the latest methods for managing malolactic fermentation?",
  "How do I test for and prevent Brett contamination in my wines?",
  "What's the difference between treating smoke taint with activated carbon vs nanofiltration?",
  "How does protein instability affect wine and how do I test for it?",
  "What are the recommended oxygen management techniques during winemaking?",
  "How do I calculate energy values for EU wine labels?",
  "What are the sensory impacts of smoke exposure on wine?",
  "How effective are glycosidases for treating smoke-affected wine?",
  "What are the best practices for managing botrytis-infected fruit?",
  "How do I measure and manage tannins in my wines?",
  "What causes pepper flavour in wine and how can I control it?",
  "How does malolactic fermentation differ in white vs red wines?",
  "What are the latest techniques for reducing ethanol levels in wine?",
  "How do I manage powdery mildew contamination in the winery?",
  "What's the most effective way to treat wine with untoasted oak chips?",
  "How do I measure anthocyanins and their impact on wine color?",
  "What are the best small lot fermentation methods for trials?",
  "How does oxygen transmission rate affect wine aging and storage?"
];

interface FlowingPromptsProps {
  className?: string;
  isSearchEnabled?: boolean;
  setIsSearchEnabled?: React.Dispatch<React.SetStateAction<boolean>>;
}

const ComposerAction: React.FC = () => {
  return (
    <>
      <ThreadPrimitive.If running={false}>
        <ComposerPrimitive.Send asChild>
          <TooltipIconButton
            tooltip="Send"
            variant="default"
            className="my-2.5 size-8 rounded-full p-1.5 transition-opacity ease-in bg-[#8b2c2c] hover:bg-[#b54545] text-white"
            type="button"
          >
            <ArrowUpIcon className="!size-4" />
          </TooltipIconButton>
        </ComposerPrimitive.Send>
      </ThreadPrimitive.If>
      <ThreadPrimitive.If running>
        <ComposerPrimitive.Cancel asChild>
          <TooltipIconButton
            tooltip="Cancel"
            variant="default"
            className="my-2.5 size-8 rounded-full p-1.5 transition-opacity ease-in bg-red-600 hover:bg-red-700 text-white"
          >
            <span className="!size-4">⏹</span>
          </TooltipIconButton>
        </ComposerPrimitive.Cancel>
      </ThreadPrimitive.If>
    </>
  );
};

const SidebarComposer: React.FC<{
  isSearchEnabled: boolean;
  setIsSearchEnabled: React.Dispatch<React.SetStateAction<boolean>>;
}> = ({ isSearchEnabled, setIsSearchEnabled }) => {
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
    <div className="w-full p-2">
      <ComposerPrimitive.Root className="focus-within:border-ring/20 flex w-full flex-wrap items-end rounded-full border border-border bg-background px-2.5 shadow-sm transition-colors ease-in">
        <TooltipIconButton
          tooltip={isSearchEnabled ? "Disable Web Search" : "Enable Web Search"}
          variant="ghost"
          className={cn(
            "my-2.5 size-8 rounded-full p-1.5 transition-colors ease-in",
            isSearchEnabled
              ? "text-blue-500 hover:bg-blue-500/10"
              : "text-muted-foreground hover:text-foreground hover:bg-accent"
          )}
          onClick={() => setIsSearchEnabled(!isSearchEnabled)}
        >
          <GlobeIcon className="!size-4" />
        </TooltipIconButton>

        <ComposerPrimitive.Input
          rows={1}
          autoFocus
          placeholder={getPlaceholderText()}
          className="placeholder:text-muted-foreground max-h-32 flex-grow resize-none border-none bg-transparent px-3 py-3 text-sm outline-none focus:ring-0 disabled:cursor-not-allowed text-foreground"
          submitOnEnter
        />
        <div className="flex gap-2">
          <ComposerAction />
        </div>
      </ComposerPrimitive.Root>
    </div>
  );
};

export const FlowingPrompts: React.FC<FlowingPromptsProps> = ({ 
  className, 
  isSearchEnabled = false, 
  setIsSearchEnabled = () => {} 
}) => {
  const thread = useThread();

  // Create extended list to ensure smooth infinite scroll
  const extendedPrompts = [
    ...WINE_INDUSTRY_PROMPTS,
    ...WINE_INDUSTRY_PROMPTS, // Duplicate for seamless loop
    ...WINE_INDUSTRY_PROMPTS.slice(0, 10) // Extra buffer
  ];

  const promptHeight = 80; // Height per prompt including spacing
  const visiblePrompts = 5;
  const viewportHeight = promptHeight * visiblePrompts;

  return (
    <div
      className={cn(
        "w-80 h-full bg-[#191a1a] flex flex-col transition-all duration-300 ease-in-out",
        "animate-in slide-in-from-left-4 fade-in-0",
        className
      )}
    >
      {/* Header */}
      <div className="p-6">
        <h2 className="text-xl font-semibold text-foreground mb-2">
          Get Started
        </h2>
        <p className="text-sm text-muted-foreground">
          Ask questions about wine research, production techniques, and industry best practices
        </p>
      </div>

      {/* Waterfall Container */}
      <div className="flex-1 flex flex-col justify-center px-4">
        <div 
          className="relative overflow-hidden rounded-lg"
          style={{ height: `${viewportHeight}px` }}
        >
          {/* Gradient masks for smooth fade in/out */}
          <div className="absolute top-0 left-0 right-0 h-6 bg-gradient-to-b from-background to-transparent z-10 pointer-events-none" />
          <div className="absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-background to-transparent z-10 pointer-events-none" />
          
          {/* Scrolling prompts container */}
          <div 
            className="absolute inset-0"
            style={{
              height: `${extendedPrompts.length * promptHeight}px`,
            }}
          >
            <div 
              className="space-y-3"
              style={{
                animation: `waterfall ${extendedPrompts.length * 2.5}s linear infinite`,
              }}
            >
              {extendedPrompts.map((prompt, index) => (
                <div
                  key={`${prompt}-${index}`}
                  className="px-1"
                  style={{ height: `${promptHeight - 12}px` }} // Subtract spacing
                >
                  <ThreadPrimitive.Suggestion
                    prompt={prompt}
                    method="replace"
                    autoSend
                    className={cn(
                      "w-full h-full text-left p-3 rounded-lg border border-border",
                      "hover:bg-accent hover:text-accent-foreground",
                      "transition-all duration-200 ease-in-out",
                      "text-sm text-foreground",
                      "group flex items-start justify-between gap-2",
                      "hover:scale-105 hover:shadow-md",
                      "bg-background/80 backdrop-blur-sm"
                    )}
                  >
                    <span 
                      className="flex-1 leading-relaxed"
                      style={{
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden'
                      }}
                    >
                      {prompt}
                    </span>
                    <ChevronRightIcon className="w-4 h-4 text-muted-foreground group-hover:text-accent-foreground transition-colors flex-shrink-0 mt-0.5" />
                  </ThreadPrimitive.Suggestion>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Input Field */}
      {/* <div className="border-t border-border">
        <SidebarComposer 
          isSearchEnabled={isSearchEnabled} 
          setIsSearchEnabled={setIsSearchEnabled} 
        />
      </div> */}

      {/* Footer */}
      <div className="p-4">
        <div className="flex justify-center space-x-1 mb-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30 animate-pulse"
              style={{ animationDelay: `${i * 200}ms` }}
            />
          ))}
        </div>
        <p className="text-xs text-muted-foreground text-center">
          Questions flowing from AWRI research
        </p>
      </div>

      {/* Inline CSS for animation */}
      <style jsx>{`
        @keyframes waterfall {
          0% {
            transform: translateY(0);
          }
          100% {
            transform: translateY(-${WINE_INDUSTRY_PROMPTS.length * promptHeight}px);
          }
        }
      `}</style>
    </div>
  );
}; 