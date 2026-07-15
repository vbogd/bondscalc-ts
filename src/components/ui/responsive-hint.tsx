import { X } from "lucide-react";
import * as React from "react";

import {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const FINE_POINTER_QUERY = "(hover: hover) and (pointer: fine)";

function useFinePointer() {
  const getMatches = () =>
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia(FINE_POINTER_QUERY).matches;
  const [hasFinePointer, setHasFinePointer] = React.useState(getMatches);

  React.useEffect(() => {
    if (typeof window.matchMedia !== "function") {
      return;
    }

    const mediaQuery = window.matchMedia(FINE_POINTER_QUERY);
    const updateMatches = () => setHasFinePointer(mediaQuery.matches);

    updateMatches();
    mediaQuery.addEventListener("change", updateMatches);

    return () => mediaQuery.removeEventListener("change", updateMatches);
  }, []);

  return hasFinePointer;
}

function ResponsiveHint({
  children,
  content,
  contentClassName,
  sideOffset = 8,
}: {
  children: React.ReactElement;
  content: React.ReactNode;
  contentClassName?: string;
  sideOffset?: number;
}) {
  const hasFinePointer = useFinePointer();

  if (hasFinePointer) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>{children}</TooltipTrigger>
          <TooltipContent sideOffset={sideOffset} className={contentClassName}>
            {content}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        sideOffset={sideOffset}
        className={cn(
          "relative w-[min(20rem,calc(100vw-2rem))] max-h-[min(24rem,var(--radix-popover-content-available-height))] overflow-y-auto pr-10",
          contentClassName,
        )}
      >
        {content}
        <PopoverClose
          aria-label="Закрыть подсказку"
          className="absolute top-2 right-2 inline-flex size-7 items-center justify-center rounded-sm text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          type="button"
        >
          <X className="size-4" aria-hidden="true" />
        </PopoverClose>
      </PopoverContent>
    </Popover>
  );
}

export { ResponsiveHint };
