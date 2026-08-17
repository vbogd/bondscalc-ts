import { CircleHelp, Search } from "lucide-react";
import { useId, type ReactNode } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ResponsiveHint } from "@/components/ui/responsive-hint";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "danger" | "up" | "down" | "warning";

export function SearchInput({
  label = "Поиск",
  maxLength,
  onChange,
  placeholder,
  value,
}: {
  label?: string;
  maxLength?: number;
  onChange: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  return (
    <label className="relative block">
      <span className="sr-only">{label}</span>
      <Search
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <Input
        className="h-11 pl-9 text-base"
        maxLength={maxLength}
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
      variant={tone === "danger" ? "destructive" : "outline"}
      className={cn(
        "text-xs font-medium",
        tone === "up" && "border-success/25 bg-success/10 text-success",
        tone === "down" && "text-destructive",
        tone === "warning" && "border-warning/25 bg-warning/10 text-warning",
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
      className="grid w-full grid-cols-3 rounded-md border bg-background p-1"
    >
      {items.map((item) => (
        <ToggleGroupItem
          className="h-9 min-w-0 px-2 text-sm"
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
  const inputId = useId();

  return (
    <Field className="min-w-0">
      <FieldLabel htmlFor={inputId}>{label}</FieldLabel>
      <Input
        id={inputId}
        inputMode={type === "date" ? undefined : "decimal"}
        onChange={(event) => onChange(event.target.value)}
        type={type}
        value={value}
      />
    </Field>
  );
}

export function ResultPanel({
  children,
  controls,
  footer,
  title,
}: {
  children: ReactNode;
  controls?: ReactNode;
  footer?: ReactNode;
  title: string;
}) {
  return (
    <Card>
      <CardHeader
        className={cn(
          "flex flex-row flex-wrap items-center justify-between gap-x-3 gap-y-1",
          !controls && "block",
        )}
      >
        <CardTitle>
          <h2 className="text-xl">{title}</h2>
        </CardTitle>
        {controls}
      </CardHeader>
      <CardContent>{children}</CardContent>
      {footer ? (
        <CardFooter>
          <div className="w-full">{footer}</div>
        </CardFooter>
      ) : null}
    </Card>
  );
}

export function ResultRow({
  labelAction,
  labelActionLabel,
  label,
  strong = false,
  tooltip,
  tooltipLabel = `Описание показателя «${label}»`,
  value,
  valueTone = "neutral",
}: {
  labelAction?: () => void;
  labelActionLabel?: string;
  label: string;
  value: string;
  strong?: boolean;
  tooltip?: string;
  tooltipLabel?: string;
  valueTone?: Tone;
}) {
  const tooltipId = `result-tooltip-${label.replace(/[^a-zа-яё0-9]+/gi, "-")}`;

  return (
    <>
      <dt className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
        {labelAction ? (
          <TextActionButton
            actionLabel={labelActionLabel ?? `Переключить показатель «${label}»`}
            ariaLabel={labelActionLabel}
            className="min-w-0 -my-2.5 py-2.5 text-left before:-inset-x-2"
            onClick={labelAction}
          >
            {label}
          </TextActionButton>
        ) : (
          <span className="min-w-0">{label}</span>
        )}
        {labelActionLabel ? (
          <span id={`${tooltipId}-action`} className="sr-only">
            {labelActionLabel}
          </span>
        ) : null}
        {tooltip ? (
          <>
            <ResponsiveHint
              sideOffset={8}
              contentClassName="whitespace-pre-line"
              content={tooltip}
            >
              <button
                aria-describedby={tooltipId}
                aria-label={tooltipLabel}
                className="inline-flex size-[1.35em] shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                type="button"
              >
                <CircleHelp className="size-[0.85em]" aria-hidden="true" />
              </button>
            </ResponsiveHint>
            <span id={tooltipId} className="sr-only">
              {tooltip}
            </span>
          </>
        ) : null}
      </dt>
      <dd
        className={cn(
          "min-w-0 text-right tabular-nums text-foreground",
          strong && "font-semibold",
          (valueTone === "down" || valueTone === "danger") && "text-destructive",
          valueTone === "warning" && "text-muted-foreground",
        )}
      >
        {value}
      </dd>
    </>
  );
}

const TEXT_ACTION_BUTTON_CLASS =
  "relative isolate inline-flex items-center justify-center min-h-11 cursor-pointer rounded-sm text-action underline decoration-1 decoration-action/40 underline-offset-4 transition-colors before:pointer-events-none before:absolute before:inset-x-0 before:inset-y-2 before:-z-10 before:rounded-sm before:content-[''] before:transition-colors active:text-action-hover active:before:bg-accent hover:text-action-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function TextActionButton({
  actionLabel,
  ariaLabel,
  children,
  className,
  onClick,
  pressed,
}: {
  actionLabel: string;
  ariaLabel?: string;
  children: ReactNode;
  className?: string;
  onClick: () => void;
  pressed?: boolean;
}) {
  return (
    <>
      <button
        aria-describedby={`${actionLabel.replace(/[^a-zа-яё0-9]+/gi, "-")}-action`}
        aria-label={ariaLabel}
        aria-pressed={pressed}
        className={cn(TEXT_ACTION_BUTTON_CLASS, className)}
        onClick={onClick}
        type="button"
      >
        {children}
      </button>
      <span
        id={`${actionLabel.replace(/[^a-zа-яё0-9]+/gi, "-")}-action`}
        className="sr-only"
      >
        {actionLabel}
      </span>
    </>
  );
}

export function TextToggleButton({
  actionLabel,
  ariaLabel,
  children,
  onClick,
  pressed,
}: {
  actionLabel: string;
  ariaLabel?: string;
  children: ReactNode;
  onClick: () => void;
  pressed: boolean;
}) {
  return (
    <TextActionButton
      actionLabel={actionLabel}
      ariaLabel={ariaLabel}
      className="justify-start px-2 text-left text-lg leading-6 font-medium sm:text-xl"
      onClick={onClick}
      pressed={pressed}
    >
      {children}
    </TextActionButton>
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
    <Alert variant={tone === "danger" ? "destructive" : "default"}>
      {icon ?? <Search className="size-4" aria-hidden="true" />}
      <AlertTitle>
        <h2>{title}</h2>
      </AlertTitle>
      <AlertDescription>{text}</AlertDescription>
    </Alert>
  );
}
