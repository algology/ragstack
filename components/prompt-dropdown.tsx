"use client";

import React, { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

// Legacy exports for backward compatibility (will be replaced with API data)
export const WINE_PRODUCTION_PROMPTS: string[] = [];
export const VINEYARD_MANAGEMENT_PROMPTS: string[] = [];  
export const RECENT_RESEARCH_PROMPTS: string[] = [];

// Hook to fetch prompts from API
export function usePrompts() {
  const [prompts, setPrompts] = useState<{
    wine_production: string[];
    vineyard_management: string[];
    recent_research: string[];
  }>({
    wine_production: [],
    vineyard_management: [],
    recent_research: []
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPrompts = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const response = await fetch('/api/prompts');
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Failed to fetch prompts');
        }

        setPrompts(data.prompts || {
          wine_production: [],
          vineyard_management: [],
          recent_research: []
        });

        // Update legacy exports for immediate backward compatibility
        WINE_PRODUCTION_PROMPTS.length = 0;
        WINE_PRODUCTION_PROMPTS.push(...(data.prompts?.wine_production || []));
        
        VINEYARD_MANAGEMENT_PROMPTS.length = 0;
        VINEYARD_MANAGEMENT_PROMPTS.push(...(data.prompts?.vineyard_management || []));
        
        RECENT_RESEARCH_PROMPTS.length = 0;
        RECENT_RESEARCH_PROMPTS.push(...(data.prompts?.recent_research || []));

      } catch (err) {
        console.error('Error fetching prompts:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch prompts');
        
        // Fallback to hardcoded prompts if API fails
        const fallbackPrompts = {
          wine_production: [
            "What is smoke taint and how does it affect wine quality?",
            "How can I treat smoke-affected grapes before fermentation?",
            "What are the latest methods for managing malolactic fermentation?",
            "How do I test for and prevent Brett contamination in my wines?",
            "What's the difference between treating smoke taint with activated carbon vs nanofiltration?",
            "How does protein instability affect wine and how do I test for it?",
            "What are the recommended oxygen management techniques during winemaking?"
          ],
          vineyard_management: [
            "How do I manage powdery mildew in my vineyard?",
            "What are the best soil management practices for wine grapes?",
            "When is the optimal time to harvest grapes for different wine styles?",
            "How do I assess grape ripeness and sugar levels in the vineyard?",
            "What are effective organic pest control methods for vineyards?",
            "How does terroir influence grape quality and wine character?",
            "What pruning techniques maximize grape quality over quantity?"
          ],
          recent_research: [
            "What are the latest findings on Pierce's Disease-resistant grapevine varieties from UC Davis?",
            "How is climate change affecting global wine production in 2024-2025?",
            "What are the key trends driving the organic wine market growth?",
            "How are consumer demographics and drinking patterns changing in the wine industry?",
            "What innovative viticultural techniques are being researched to adapt to climate warming?"
          ]
        };
        
        setPrompts(fallbackPrompts);
        
        // Update legacy exports with fallback data
        WINE_PRODUCTION_PROMPTS.length = 0;
        WINE_PRODUCTION_PROMPTS.push(...fallbackPrompts.wine_production);
        
        VINEYARD_MANAGEMENT_PROMPTS.length = 0;
        VINEYARD_MANAGEMENT_PROMPTS.push(...fallbackPrompts.vineyard_management);
        
        RECENT_RESEARCH_PROMPTS.length = 0;
        RECENT_RESEARCH_PROMPTS.push(...fallbackPrompts.recent_research);
        
      } finally {
        setLoading(false);
      }
    };

    fetchPrompts();
  }, []);

  return { prompts, loading, error };
}

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