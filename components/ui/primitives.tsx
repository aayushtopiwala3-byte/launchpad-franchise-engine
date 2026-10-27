import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import type {
  ButtonHTMLAttributes,
  CSSProperties,
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { STATUS_COLORS } from "../../lib/reference";
import type { Severity, Status } from "../../lib/types";

export const cn = (...parts: unknown[]) => twMerge(clsx(parts));

const BUTTON_VARIANTS = {
  primary:
    "bg-brand text-white border border-brand shadow-[0_8px_18px_#7c3aed47] hover:brightness-110 disabled:bg-stone-400 disabled:border-stone-400 disabled:shadow-none",
  secondary:
    "bg-surface text-stone-900 border border-line-2 hover:border-stone-500 disabled:text-stone-400 disabled:border-line",
  ghost: "border border-transparent text-stone-700 hover:bg-stone-100 disabled:text-stone-400",
  danger:
    "bg-red-600 text-white border border-red-600 shadow-[0_8px_18px_#dc354740] hover:brightness-110 disabled:bg-red-300 disabled:border-red-300 disabled:shadow-none",
} as const;

const BUTTON_SIZES = {
  sm: "h-8 rounded-[10px] px-3 text-sm",
  md: "h-10 rounded-xl px-4 text-sm",
  lg: "h-12 rounded-xl px-6 text-base",
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
        "inline-flex items-center justify-center gap-2 font-semibold transition-[transform,box-shadow,border-color,filter,background-color] duration-150 active:translate-y-px disabled:cursor-not-allowed disabled:active:translate-y-0",
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        className,
      )}
      {...rest}
    />
  );
}

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("shadow-card rounded-[18px] border border-line bg-surface", className)}
      {...rest}
    />
  );
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
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium capitalize",
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
    <div className="lift shadow-card rounded-[14px] border border-line bg-surface px-3 py-2.5">
      <div className="text-xs font-medium text-muted">{label}</div>
      <div
        className={cn(
          "anim-pop mt-0.5 text-2xl font-semibold tracking-tight tabular-nums",
          tones[tone],
        )}
      >
        {value}
      </div>
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
    info: "bg-sky-50 border-sky-200 text-sky-900 before:bg-sky-500",
    warn: "bg-amber-50 border-amber-200 text-amber-900 before:bg-amber-500",
    error: "bg-red-50 border-red-200 text-red-900 before:bg-red-500",
    success: "bg-emerald-50 border-emerald-200 text-emerald-900 before:bg-emerald-500",
  };
  return (
    <div
      className={cn(
        "anim-rise relative flex items-start justify-between gap-4 overflow-hidden rounded-[14px] border py-3 pr-4 pl-5",
        "before:absolute before:inset-y-0 before:left-0 before:w-1.5 before:content-['']",
        tones[tone],
      )}
    >
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

/**
 * The counterpart to NotStated: it marks a record that was invented for illustration. It is
 * deliberately loud, because a sample lead sitting in a list of real ones is the exact way a
 * demo turns into a false claim.
 */
export function DemoBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border border-transparent bg-brand-soft px-2 py-0.5 text-xs font-semibold text-brand",
        className,
      )}
      title="Illustrative record. Invented for the demonstration — it describes no real person."
    >
      Sample data
    </span>
  );
}

const CONTROL =
  "w-full rounded-xl border border-line-2 bg-surface px-2.5 py-1.5 text-sm transition-[border-color,box-shadow] duration-150 outline-none focus:border-brand focus:ring-2 focus:ring-brand-soft disabled:bg-stone-50 disabled:text-stone-400";

export function TextInput({
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(CONTROL, className)} {...rest} />;
}

export function TextArea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(CONTROL, "min-h-20", className)} {...rest} />;
}

export function Select({ className, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(CONTROL, "h-[34px]", className)} {...rest} />;
}

export function Labelled({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

/** Always accompanied by the numbers behind it — a bare percentage says nothing. */
export function ProgressBar({
  percent,
  label,
  className,
}: {
  percent: number;
  label: string;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div className={className}>
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-stone-200"
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div
          className="bar-fill h-full rounded-full bg-gradient-to-r from-brand to-[#a855f7]"
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}

/**
 * A ring is only ever drawn beside the two numbers it was divided from. On its own it
 * would be a shape that implies a measurement nobody can check.
 */
export function ProgressRing({
  percent,
  size = 56,
  label,
}: {
  percent: number;
  size?: number;
  label: string;
}) {
  const clamped = Math.max(0, Math.min(100, percent));
  const stroke = 6;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={label}
      className="shrink-0 -rotate-90"
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--line)"
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--brand)"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c - (c * clamped) / 100}
        style={
          {
            "--c": `${c}`,
            animation: "lp-ringfill 1.1s var(--ease) both 0.15s",
            transition: "stroke-dashoffset 0.55s var(--ease)",
          } as CSSProperties
        }
      />
    </svg>
  );
}

export function RuleTag({ id }: { id: string }) {
  return (
    <code className="rounded bg-stone-100 px-1 py-0.5 font-mono text-xs whitespace-nowrap text-stone-600">
      {id}
    </code>
  );
}
