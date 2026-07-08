import { CircleHelp, Search } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "danger" | "up" | "down" | "warning";

export function SearchInput({
  label = "Поиск",
  onChange,
  placeholder,
  value,
}: {
  label?: string;
  onChange: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  return (
    <label className="flex min-h-12 items-center gap-3 rounded-full bg-surface-strong px-5 transition-shadow focus-within:ring-4 focus-within:ring-primary/15">
      <Search className="size-5 shrink-0 text-body" aria-hidden="true" />
      <span className="sr-only">{label}</span>
      <Input
        className="h-11 min-w-0 flex-1 border-0 bg-transparent px-0 py-0 text-base text-foreground shadow-none outline-none placeholder:text-muted-soft focus-visible:border-0 focus-visible:ring-0 sm:text-lg"
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        type="search"
        value={value}
      />
    </label>
  );
}

export function BondBadge({
  children,
  className,
  tone = "neutral",
}: {
  children: ReactNode;
  className?: string;
  tone?: Tone;
}) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "rounded-full border-transparent bg-surface-strong px-3 py-1 text-xs font-semibold text-foreground",
        tone === "danger" && "text-semantic-down",
        tone === "up" && "text-semantic-up",
        tone === "down" && "text-semantic-down",
        tone === "warning" && "text-semantic-warning",
        className,
      )}
    >
      {children}
    </Badge>
  );
}

export function ModeToggle<TValue extends string>({
  items,
  onChange,
  value,
}: {
  items: Array<{ label: string; value: TValue; disabled?: boolean }>;
  onChange: (value: TValue) => void;
  value: TValue;
}) {
  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(nextValue) => {
        if (nextValue) {
          onChange(nextValue as TValue);
        }
      }}
      className="grid min-h-12 w-full grid-cols-3 rounded-full border border-border bg-surface-strong p-1 text-sm font-semibold"
    >
      {items.map((item) => (
        <ToggleGroupItem
          className="min-h-11 rounded-full px-2 text-body transition-colors hover:bg-white hover:text-foreground disabled:text-muted-soft data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:shadow-sm"
          disabled={item.disabled}
          key={item.value}
          value={item.value}
        >
          {item.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

export function InputField({
  label,
  onChange,
  type = "text",
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  type?: "date" | "text";
  value: string;
}) {
  return (
    <label className="block min-w-0 rounded-xl border border-border bg-card px-3 py-3 transition-shadow focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/15">
      <span className="block text-xs font-semibold uppercase leading-5 text-body">
        {label}
      </span>
      <Input
        className="number mt-1 h-11 w-full min-w-0 border-0 bg-transparent px-0 py-0 text-xl font-medium text-foreground shadow-none outline-none focus-visible:border-0 focus-visible:ring-0"
        inputMode={type === "date" ? undefined : "decimal"}
        onChange={(event) => onChange(event.target.value)}
        type={type}
        value={value}
      />
    </label>
  );
}

export function ResultPanel({
  children,
  footer,
  title,
}: {
  children: ReactNode;
  footer?: ReactNode;
  title: string;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="border-b border-border px-4 py-4">
        <h2 className="text-xl font-medium text-foreground">{title}</h2>
      </div>
      {children}
      {footer ? <div className="border-t border-border">{footer}</div> : null}
    </section>
  );
}

export function ResultRow({
  label,
  strong = false,
  tooltip,
  tooltipAlign = "right",
  tooltipLabel = `Описание показателя «${label}»`,
  value,
  valueTone = "neutral",
}: {
  label: string;
  value: string;
  strong?: boolean;
  tooltip?: string;
  tooltipAlign?: "left" | "right";
  tooltipLabel?: string;
  valueTone?: Tone;
}) {
  const tooltipId = `result-tooltip-${label.replace(/[^a-zа-яё0-9]+/gi, "-")}`;

  return (
    <>
      <dt className="flex min-w-0 items-center gap-1.5 text-body">
        <span className="min-w-0">{label}</span>
        {tooltip ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  aria-describedby={tooltipId}
                  aria-label={tooltipLabel}
                  className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted-soft outline-none transition-colors hover:text-body-strong focus-visible:text-body-strong focus-visible:ring-2 focus-visible:ring-primary"
                  type="button"
                >
                  <CircleHelp className="size-4" aria-hidden="true" />
                </button>
              </TooltipTrigger>
              <TooltipContent
                align={tooltipAlign === "left" ? "start" : "end"}
                className="max-w-[min(18rem,calc(100vw-2rem))] data-[state=closed]:hidden"
                forceMount
                sideOffset={8}
              >
                {tooltip}
              </TooltipContent>
            </Tooltip>
            <span id={tooltipId} className="sr-only">
              {tooltip}
            </span>
          </TooltipProvider>
        ) : null}
      </dt>
      <dd
        className={cn(
          "number min-w-0 text-right text-foreground",
          strong && "font-semibold",
          valueTone === "up" && "text-semantic-up",
          (valueTone === "down" || valueTone === "danger") && "text-semantic-down",
          valueTone === "warning" && "text-semantic-warning",
        )}
      >
        {value}
      </dd>
    </>
  );
}

export function StateMessage({
  icon,
  text,
  title,
  tone = "neutral",
}: {
  icon?: ReactNode;
  text: string;
  title: string;
  tone?: "neutral" | "danger";
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border px-4 py-5",
        tone === "danger"
          ? "border-destructive/20 bg-destructive/5 text-destructive"
          : "border-border bg-card text-body",
      )}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 text-current">
          {icon ?? <Search className="size-5" aria-hidden="true" />}
        </div>
        <div className="min-w-0">
          <h2 className="text-lg font-medium text-foreground">{title}</h2>
          <p className="mt-1 text-base">{text}</p>
        </div>
      </div>
    </div>
  );
}
