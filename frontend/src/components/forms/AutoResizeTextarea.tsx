"use client";

import React, { useLayoutEffect, useRef } from "react";

interface AutoResizeTextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  value: string;
  minHeight?: number;
}

export const AutoResizeTextarea = React.forwardRef<
  HTMLTextAreaElement,
  AutoResizeTextareaProps
>(({ value, className = "", minHeight = 24, rows = 1, onInput, ...props }, ref) => {
  const innerRef = useRef<HTMLTextAreaElement | null>(null);

  const adjustHeight = () => {
    const textarea = innerRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    const nextHeight = Math.max(textarea.scrollHeight, minHeight);
    textarea.style.height = `${nextHeight}px`;
  };

  useLayoutEffect(() => {
    adjustHeight();
  }, [value]);

  return (
    <textarea
      {...props}
      ref={(node) => {
        innerRef.current = node;
        if (typeof ref === "function") {
          ref(node);
        } else if (ref) {
          (ref as React.MutableRefObject<HTMLTextAreaElement | null>).current = node;
        }
      }}
      value={value}
      rows={rows}
      onInput={(e) => {
        adjustHeight();
        onInput?.(e);
      }}
      style={{
        resize: "none",
        overflow: "hidden",
        minHeight: `${minHeight}px`,
        ...props.style,
      }}
      className={`w-full bg-transparent focus:outline-none break-words whitespace-pre-wrap ${className}`}
    />
  );
});

AutoResizeTextarea.displayName = "AutoResizeTextarea";
