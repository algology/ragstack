"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

// Wine Production Prompts - focused on winemaking processes
export const WINE_PRODUCTION_PROMPTS = [
  "What is smoke taint and how does it affect wine quality?",
  "How can I treat smoke-affected grapes before fermentation?",
  "What are the latest methods for managing malolactic fermentation?",
  "How do I test for and prevent Brett contamination in my wines?",
  "What's the difference between treating smoke taint with activated carbon vs nanofiltration?",
  "How does protein instability affect wine and how do I test for it?",
  "What are the recommended oxygen management techniques during winemaking?"
];

// Vineyard Management Prompts - focused on grape growing and vineyard operations
export const VINEYARD_MANAGEMENT_PROMPTS = [
  "How do I manage powdery mildew in my vineyard?",
  "What are the best soil management practices for wine grapes?",
  "When is the optimal time to harvest grapes for different wine styles?",
  "How do I assess grape ripeness and sugar levels in the vineyard?",
  "What are effective organic pest control methods for vineyards?",
  "How does terroir influence grape quality and wine character?",
  "What pruning techniques maximize grape quality over quantity?"
];

interface PromptDropdownProps {
  prompts: string[];
  title: string;
  icon: LucideIcon;
  ariaLabel: string;
  isOpen: boolean;
  onToggle: () => void;
  onPromptSelect: () => void;
  className?: string;
}

export const PromptDropdown: React.FC<PromptDropdownProps> = ({ 
  icon: IconComponent, 
  ariaLabel,
  isOpen,
  onToggle,
  className 
}) => {
  return (
    <div className={cn("relative", className)}>
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "my-2.5 size-10 rounded-full p-2 transition-colors ease-in",
          "text-muted-foreground hover:text-foreground hover:bg-accent",
          "flex items-center justify-center",
          isOpen && "bg-accent text-foreground"
        )}
        aria-label={ariaLabel}
      >
        <IconComponent className="!size-5" />
      </button>
    </div>
  );
};