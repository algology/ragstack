"use client";

import React, { useState } from "react";
import { ThumbsUp, ThumbsDown } from "lucide-react";
import { TooltipIconButton } from "@/components/assistant-ui/tooltip-icon-button";
import { cn } from "@/lib/utils";

interface FeedbackButtonsProps {
  conversationId: string;
  messageContent: string; // Keep for backward compatibility
  userQuestion?: string; // New: the user's original question/prompt
  aiResponse?: string; // New: the AI's response content (if different from messageContent)
  contextInfo?: {
    hasRAGSources?: boolean;
    hasWebSearch?: boolean;
    ragSources?: Array<{
      documentId?: string;
      documentName?: string;
      pageNumber?: number;
    }>;
    webSearchQueries?: string[];
    [key: string]: any;
  };
  className?: string;
}

type FeedbackState = 'none' | 'thumbs_up' | 'thumbs_down' | 'loading';

export const FeedbackButtons: React.FC<FeedbackButtonsProps> = ({
  conversationId,
  messageContent,
  userQuestion,
  aiResponse,
  contextInfo,
  className
}) => {
  const [feedbackState, setFeedbackState] = useState<FeedbackState>('none');

  const submitFeedback = async (feedbackType: 'thumbs_up' | 'thumbs_down') => {
    // Validate required fields before sending
    if (!conversationId || !messageContent || !messageContent.trim()) {
      console.error('Cannot submit feedback: missing conversationId or messageContent');
      return;
    }

    // Prevent double-clicking the same button
    if (feedbackState === feedbackType || feedbackState === 'loading') {
      return;
    }

    console.log('Submitting feedback:', { 
      conversationId, 
      messageContentLength: messageContent.length, 
      feedbackType 
    });

    setFeedbackState('loading');

    try {
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          conversationId,
          messageContent, // Keep for backward compatibility
          feedbackType,
          contextInfo,
          userQuestion,
          aiResponse: aiResponse || messageContent // Use aiResponse if provided, fallback to messageContent
        })
      });

      const result = await response.json();

      if (response.ok) {
        setFeedbackState(feedbackType);
        console.log('Feedback submitted successfully:', result);
      } else {
        console.error('Failed to submit feedback:', result.error);
        setFeedbackState('none'); // Reset on error
        alert(`Failed to submit feedback: ${result.error}`);
      }
    } catch (error) {
      console.error('Error submitting feedback:', error);
      setFeedbackState('none'); // Reset on error
      alert('Network error while submitting feedback. Please try again.');
    }
  };

  const handleThumbsUp = () => submitFeedback('thumbs_up');
  const handleThumbsDown = () => submitFeedback('thumbs_down');

  return (
    <div className={cn("flex gap-1 items-center", className)}>
      <TooltipIconButton
        tooltip={feedbackState === 'thumbs_up' ? "You liked this response" : "Good response"}
        variant="ghost"
        className={cn(
          "size-7 p-1.5 transition-colors duration-200",
          feedbackState === 'thumbs_up'
            ? "text-green-500 hover:text-green-600 bg-green-500/10 hover:bg-green-500/20"
            : "text-gray-400 hover:text-green-500 hover:bg-green-500/10",
          feedbackState === 'loading' && "opacity-50 cursor-not-allowed"
        )}
        onClick={handleThumbsUp}
        disabled={feedbackState === 'loading'}
      >
        <ThumbsUp className="!size-3.5" />
      </TooltipIconButton>

      <TooltipIconButton
        tooltip={feedbackState === 'thumbs_down' ? "You disliked this response" : "Poor response"}
        variant="ghost"
        className={cn(
          "size-7 p-1.5 transition-colors duration-200",
          feedbackState === 'thumbs_down'
            ? "text-red-500 hover:text-red-600 bg-red-500/10 hover:bg-red-500/20"
            : "text-gray-400 hover:text-red-500 hover:bg-red-500/10",
          feedbackState === 'loading' && "opacity-50 cursor-not-allowed"
        )}
        onClick={handleThumbsDown}
        disabled={feedbackState === 'loading'}
      >
        <ThumbsDown className="!size-3.5" />
      </TooltipIconButton>
    </div>
  );
};