"use client";

import { useEffect, useRef, type ChangeEvent } from "react";

interface AutoResizeTextareaProps {
  id?: string;
  value: string;
  onChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  className?: string;
  rows?: number;
}

export function AutoResizeTextarea({
  id,
  value,
  onChange,
  placeholder,
  className = "",
  rows = 1,
}: AutoResizeTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustHeight = () => {
    const element = textareaRef.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${element.scrollHeight}px`;
  };

  useEffect(() => {
    adjustHeight();
  }, [value]);

  return (
    <textarea
      ref={textareaRef}
      id={id}
      rows={rows}
      value={value}
      onChange={(event) => {
        onChange(event);
        adjustHeight();
      }}
      placeholder={placeholder}
      className={`resize-none overflow-hidden ${className}`}
    />
  );
}
