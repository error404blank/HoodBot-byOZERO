import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: string;
  subValue?: string;
  icon?: ReactNode;
  highlight?: boolean;
  className?: string;
}

export function StatCard({ label, value, subValue, icon, highlight, className }: StatCardProps) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-card p-4 flex flex-col gap-2",
        highlight && "border-primary/30 bg-primary/5",
        className
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
          {label}
        </span>
        {icon && <span className="text-muted-foreground">{icon}</span>}
      </div>
      <span className={cn("text-2xl font-bold font-mono tabular-nums", highlight ? "text-primary" : "text-foreground")}>
        {value}
      </span>
      {subValue && (
        <span className="text-xs text-muted-foreground font-mono">{subValue}</span>
      )}
    </div>
  );
}
