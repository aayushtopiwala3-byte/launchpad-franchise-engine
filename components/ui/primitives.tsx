import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { STATUS_COLORS } from "../../lib/reference";
import type { Severity, Status } from "../../lib/types";

export const cn = (...parts: unknown[]) => twMerge(clsx(parts));

const BUTTON_VARIANTS = {
  primary: "bg-stone-900 text-white hover:bg-stone-700 disabled:bg-stone-400",
  secondary: "bg-white text-stone-900 border border-line hover:bg-stone-50 disabled:text-stone-400",
  ghost: "text-stone-700 hover:bg-stone-100 disabled:text-stone-400",
  danger: "bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300",
} as const;

const BUTTON_SIZES = {
  sm: "h-8 px-3 text-sm",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-base",
} as const;

export function Button({
  variant = "secondary",
  size = "md",
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof BUTTON_VARIANTS;
  size?: keyof typeof BUTTON_SIZES;
}) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:cursor-not-allowed",
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        className,
      )}
      {...rest}
    />
  );
}

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-xl border border-line bg-surface", className)} {...rest} />;
}

export function CardHeader({
  title,
  subtitle,
  action,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line px-4 py-3 sm:px-5">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
        {subtitle ? <p className="mt-0.5 text-sm text-muted">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function StatusChip({
  status,
  label,
  className,
}: {
  status: Status;
  label?: string;
  className?: string;
}) {
  const c = STATUS_COLORS[status];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        c.chip,
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", c.dot)} aria-hidden />
      {label ?? status}
    </span>
  );
}

const SEVERITY_STYLES: Record<Severity, string> = {
  blocking: "bg-red-50 text-red-800 border-red-200",
  warning: "bg-amber-50 text-amber-900 border-amber-200",
  info: "bg-stone-100 text-stone-700 border-stone-200",
};

export function SeverityChip({ severity }: { severity: Severity }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-medium capitalize",
        SEVERITY_STYLES[severity],
      )}
    >
      {severity}
    </span>
  );
}

/**
 * The single place the never-invent-a-fact rule is rendered. Anything the file did
 * not say shows this, so an absent value can never be mistaken for a real one.
 */
export function NotStated({ className }: { className?: string }) {
  return (
    <span className={cn("text-stone-400 italic", className)} title="This was not in the uploaded file.">
      not stated
    </span>
  );
}

export function Value({
  children,
  suffix,
}: {
  children: string | number | null | undefined;
  suffix?: string;
}) {
  if (children === null || children === undefined || children === "") return <NotStated />;
  return (
    <>
      {children}
      {suffix ? ` ${suffix}` : ""}
    </>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: "default" | "good" | "warn" | "bad";
}) {
  const tones = {
    default: "text-foreground",
    good: "text-emerald-700",
    warn: "text-amber-700",
    bad: "text-red-700",
  };
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2.5">
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className={cn("mt-0.5 text-2xl font-semibold tabular-nums", tones[tone])}>{value}</div>
      {hint ? <div className="mt-0.5 text-xs text-muted">{hint}</div> : null}
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      <p className="text-sm font-medium">{title}</p>
      <p className="max-w-md text-sm text-muted">{body}</p>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function Banner({
  tone,
  title,
  children,
  action,
}: {
  tone: "info" | "warn" | "error" | "success";
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  const tones = {
    info: "bg-sky-50 border-sky-200 text-sky-900",
    warn: "bg-amber-50 border-amber-200 text-amber-900",
    error: "bg-red-50 border-red-200 text-red-900",
    success: "bg-emerald-50 border-emerald-200 text-emerald-900",
  };
  return (
    <div className={cn("flex items-start justify-between gap-4 rounded-lg border px-4 py-3", tones[tone])}>
      <div className="min-w-0 text-sm">
        <p className="font-medium">{title}</p>
        {children ? <div className="mt-0.5">{children}</div> : null}
      </div>
      {action}
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  title,
  help,
  disabled,
  disabledReason,
}: {
  checked: boolean;
  onChange: () => void;
  title: string;
  help: string;
  disabled?: boolean;
  disabledReason?: string;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-lg border border-line px-3 py-2.5",
        disabled ? "cursor-not-allowed opacity-60" : "hover:bg-stone-50",
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        className="mt-0.5 size-4 shrink-0 accent-stone-900"
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-xs text-muted">{disabled ? disabledReason : help}</span>
      </span>
    </label>
  );
}

export function RuleTag({ id }: { id: string }) {
  return (
    <code className="rounded bg-stone-100 px-1 py-0.5 font-mono text-xs whitespace-nowrap text-stone-600">
      {id}
    </code>
  );
}
