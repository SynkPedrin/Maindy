export function FormAlert({ tone = 'error', children }: { tone?: 'error' | 'success' | 'info'; children: React.ReactNode }) {
  const styles = {
    error: 'border-danger/40 bg-danger/10 text-[#ffd0da]',
    success: 'border-success/40 bg-success/10 text-[#c9fbe6]',
    info: 'border-line bg-white/[0.04] text-muted',
  }[tone];
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`rounded-2xl border px-4 py-3 text-sm ${styles}`}>
      {children}
    </div>
  );
}
