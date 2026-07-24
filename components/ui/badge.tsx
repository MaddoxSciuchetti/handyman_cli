import * as React from "react";
import { cn } from "@/lib/utils";

function Badge({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-full border border-zinc-300 bg-zinc-50 px-2.5 text-xs font-medium uppercase tracking-[0.08em] text-zinc-700",
        className,
      )}
      {...props}
    />
  );
}

export { Badge };
