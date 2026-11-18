import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes, type SelectHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

const fieldBase =
  "w-full rounded-[12px] border border-line-strong bg-bg-deep/60 px-3.5 text-[15px] text-fg placeholder:text-subtle outline-none transition-[border-color,box-shadow] duration-150 focus:border-[color-mix(in_oklab,var(--m-neon)_70%,transparent)] focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--m-neon)_18%,transparent)] aria-[invalid=true]:border-error disabled:opacity-60";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cn(fieldBase, "h-11", className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cn(fieldBase, "min-h-24 py-2.5", className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, ...rest }, ref) {
  return <select ref={ref} className={cn(fieldBase, "h-11 appearance-none bg-[length:12px] pr-8", className)} {...rest} />;
});

/** Label + control + hint/error with proper aria wiring. Children is a render fn receiving ids. */
export function Field({
  label,
  hint,
  error,
  children,
  className,
  trailing,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  className?: string;
  trailing?: ReactNode;
  children: (ids: { id: string; describedBy?: string; invalid: boolean }) => ReactNode;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errId = `${id}-err`;
  const describedBy = [hint ? hintId : null, error ? errId : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-[13px] font-medium text-muted">
          {label}
        </label>
        {trailing}
      </div>
      {children({ id, describedBy, invalid: !!error })}
      {hint && !error ? (
        <p id={hintId} className="text-xs text-subtle">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errId} role="alert" className="text-xs text-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
