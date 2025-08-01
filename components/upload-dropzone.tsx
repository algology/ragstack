"use client";

import React, { useState, useRef, useCallback, DragEvent } from "react";
import { cn } from "@/lib/utils";
import { UploadCloud } from "lucide-react";

interface UploadDropzoneProps {
  onFileSelect: (files: File[]) => void;
  className?: string;
  accept?: string;
  disabled?: boolean;
}

export function UploadDropzone({
  onFileSelect,
  className,
  accept,
  disabled,
}: UploadDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      if (!disabled) {
        setIsDragging(true);
      }
    },
    [disabled]
  );

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      if (disabled) return;

      const files = e.dataTransfer.files;
      if (files && files.length > 0) {
        // Convert FileList to array and filter by accepted types
        const fileArray = Array.from(files);
        const validFiles = fileArray.filter(file => {
          if (accept) {
            const acceptedTypes = accept.split(",").map((t) => t.trim());
            const fileExtension =
              "." + (file.name.split(".").pop()?.toLowerCase() ?? "");
            return acceptedTypes.includes(file.type) || acceptedTypes.includes(fileExtension);
          }
          return true;
        });
        
        if (validFiles.length > 0) {
          onFileSelect(validFiles);
        } else {
          console.warn("No valid files found in dropped selection");
        }
      }
    },
    [onFileSelect, accept, disabled]
  );

  const handleClick = useCallback(() => {
    if (!disabled) {
      fileInputRef.current?.click();
    }
  }, [disabled]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      onFileSelect(Array.from(files));
    }
    // Reset input value to allow selecting the same file again
    if (e.target) {
      e.target.value = "";
    }
  };

  // Style mimicking the example (using Tailwind)
  // Note: Dashed border SVG background is tricky, using Tailwind's border-dashed for simplicity
  const dropzoneClasses = cn(
    "flex flex-col items-center justify-center gap-2",
    "h-[213px] cursor-pointer",
    "rounded-lg border-2 border-dashed",
    "transition-colors duration-200 ease-in-out",
    "bg-muted/50 hover:bg-muted",
    "border-border hover:border-primary/50",
    {
      "bg-primary/10 border-primary": isDragging,
      "cursor-not-allowed opacity-60": disabled,
    },
    className // Allow overriding styles
  );

  return (
    <div
      className={dropzoneClasses}
      onClick={handleClick}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      aria-disabled={disabled}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        style={{ display: "none" }}
        accept={accept}
        onChange={handleInputChange}
        disabled={disabled}
      />
      {/* Use Lucide Icon */}
      <UploadCloud
        className={cn(
          "h-12 w-12",
          disabled ? "text-muted-foreground" : "text-primary",
          isDragging ? "text-primary" : "text-muted-foreground"
        )}
        strokeWidth={1.5}
      />
      <div
        className={cn(
          "text-center text-sm",
          disabled ? "text-muted-foreground" : "text-foreground"
        )}
      >
        <p className="font-semibold">Click to upload, or drag files here</p>
        <p className="text-xs text-muted-foreground">Supports: TXT, PDF, JPG, PNG, GIF, WebP</p>
      </div>
    </div>
  );
}
