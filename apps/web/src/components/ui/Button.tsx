import Link from 'next/link';
import { forwardRef } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost';
type Size = 'md' | 'lg';

const base =
  'group relative inline-flex items-center justify-center gap-2 rounded-full font-display font-semibold tracking-tight transition-[transform,background-color,box-shadow,color,opacity] duration-300 ease-[var(--ease-out-soft)] active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 select-none';

const variants: Record<Variant, string> = {
  primary:
    'bg-[linear-gradient(135deg,#a100ff_0%,#7900ff_60%,#5b00d6_100%)] text-white shadow-[0_10px_40px_-10px_rgb(161_0_255/0.75),inset_0_1px_0_rgb(255_255_255/0.25)] hover:shadow-[0_16px_50px_-10px_rgb(161_0_255/0.95),inset_0_1px_0_rgb(255_255_255/0.3)] hover:-translate-y-0.5',
  secondary: 'glass text-white hover:bg-white/10 hover:-translate-y-0.5',
  ghost: 'text-muted hover:text-white',
};

const sizes: Record<Size, string> = {
  md: 'h-11 px-5 text-sm',
  lg: 'h-14 px-7 text-[15px] sm:text-base',
};

export function buttonClass(variant: Variant = 'primary', size: Size = 'md', extra = '') {
  return `${base} ${variants[variant]} ${sizes[size]} ${extra}`;
}

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, className = '', children, disabled, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={buttonClass(variant, size, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && (
        <span
          aria-hidden
          className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white"
        />
      )}
      {children}
    </button>
  );
});

interface ButtonLinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  variant?: Variant;
  size?: Size;
}

export function ButtonLink({ href, variant = 'primary', size = 'md', className = '', ...props }: ButtonLinkProps) {
  return <Link href={href} className={buttonClass(variant, size, className)} {...props} />;
}
