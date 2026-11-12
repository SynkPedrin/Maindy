import { Reveal } from '@/components/motion/Reveal';

interface SectionHeadingProps {
  eyebrow?: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  align?: 'center' | 'left';
  id?: string;
}

export function SectionHeading({ eyebrow, title, subtitle, align = 'center', id }: SectionHeadingProps) {
  const center = align === 'center';
  return (
    <Reveal className={`${center ? 'mx-auto text-center' : ''} max-w-3xl`}>
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <h2 id={id} className="mt-4 font-display text-[2rem] font-semibold leading-[1.08] tracking-[-0.025em] sm:text-5xl lg:text-[3.4rem]">
        {title}
      </h2>
      {subtitle && <p className={`mt-5 text-base leading-relaxed text-muted sm:text-lg ${center ? 'mx-auto' : ''} max-w-2xl`}>{subtitle}</p>}
    </Reveal>
  );
}
