import * as React from "react";
import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      className={cn(
        "flex h-12 w-full rounded-md border border-zinc-300 bg-white px-4 text-base text-zinc-950 outline-none placeholder:text-zinc-400 focus:border-zinc-950 focus:ring-1 focus:ring-zinc-950 disabled:bg-zinc-100 disabled:text-zinc-500",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
