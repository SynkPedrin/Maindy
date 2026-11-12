import { forwardRef, useId } from 'react';

const control =
  'w-full rounded-2xl border border-line bg-white/[0.03] px-4 text-[15px] text-white placeholder:text-muted/60 transition-[border-color,background-color,box-shadow] duration-200 hover:border-white/25 focus:border-electric focus:bg-white/[0.05] focus:shadow-[0_0_0_4px_rgb(161_0_255/0.18)] focus:outline-none aria-[invalid=true]:border-danger';

interface FieldShellProps {
  label: string;
  error?: string;
  hint?: string;
  id: string;
  children: React.ReactNode;
  optional?: boolean;
}

function FieldShell({ label, error, hint, id, children, optional }: FieldShellProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-white/90">
        {label}
        {optional && <span className="ml-1.5 font-normal text-muted">(opcional)</span>}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-[13px] text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-[13px] text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
  optional?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, hint, optional, className = '', id: idProp, ...props },
  ref,
) {
  const auto = useId();
  const id = idProp ?? auto;
  return (
    <FieldShell label={label} error={error} hint={hint} id={id} optional={optional}>
      <input
        ref={ref}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        className={`${control} h-12 ${className}`}
        {...props}
      />
    </FieldShell>
  );
});

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  error?: string;
  hint?: string;
  optional?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, error, hint, optional, className = '', id: idProp, ...props },
  ref,
) {
  const auto = useId();
  const id = idProp ?? auto;
  return (
    <FieldShell label={label} error={error} hint={hint} id={id} optional={optional}>
      <textarea
        ref={ref}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        className={`${control} min-h-24 resize-y py-3 ${className}`}
        {...props}
      />
    </FieldShell>
  );
});

interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  children: React.ReactNode;
  error?: string;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { children, error, id: idProp, className = '', ...props },
  ref,
) {
  const auto = useId();
  const id = idProp ?? auto;
  return (
    <div className={className}>
      <label htmlFor={id} className="flex cursor-pointer items-start gap-3 text-[13.5px] leading-relaxed text-muted">
        <input
          ref={ref}
          id={id}
          type="checkbox"
          aria-invalid={error ? true : undefined}
          className="peer mt-0.5 size-5 shrink-0 cursor-pointer appearance-none rounded-md border border-white/25 bg-white/[0.03] transition-colors checked:border-electric checked:bg-electric checked:bg-[url('data:image/svg+xml;utf8,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20viewBox=%220%200%2016%2016%22%3E%3Cpath%20d=%22M3.5%208.5l3%203%206-7%22%20fill=%22none%22%20stroke=%22white%22%20stroke-width=%222%22%20stroke-linecap=%22round%22%20stroke-linejoin=%22round%22/%3E%3C/svg%3E')] checked:bg-center checked:bg-no-repeat aria-[invalid=true]:border-danger"
          {...props}
        />
        <span>{children}</span>
      </label>
      {error && (
        <p role="alert" className="mt-1 pl-8 text-[13px] text-danger">
          {error}
        </p>
      )}
    </div>
  );
});
