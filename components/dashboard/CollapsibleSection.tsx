"use client";

import { useState } from "react";

interface CollapsibleSectionProps {
  title: string;
  badge?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

export function CollapsibleSection({
  title,
  badge,
  defaultOpen = false,
  children,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 border-b border-border hover:bg-muted/20 transition-colors"
        aria-expanded={open}
      >
        <div className="flex items-center gap-3">
          <h3 className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
            {title}
          </h3>
          {badge && (
            <span className="text-xs font-mono text-primary bg-primary/10 border border-primary/20 rounded px-2 py-0.5">
              {badge}
            </span>
          )}
        </div>
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          aria-hidden="true"
          className={`shrink-0 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        >
          <path
            d="M2.5 5L7 9.5L11.5 5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open && <div>{children}</div>}
    </div>
  );
}
