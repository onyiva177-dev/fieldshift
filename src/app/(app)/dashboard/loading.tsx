// Shown instantly while the dashboard loads. It is used ONLY on pages that never redirect back to themselves:
// a group-wide loading.tsx left pages blank after a server action redirected to the same URL with a message.
export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="space-y-4">
      <span className="sr-only">Loading</span>
      <div className="h-9 w-2/3 max-w-md animate-pulse rounded bg-field-200" />
      <div className="h-5 w-1/2 max-w-sm animate-pulse rounded bg-field-100" />
      <div className="h-40 animate-pulse rounded-lg border border-field-200 bg-white" />
      <div className="h-24 animate-pulse rounded-lg border border-field-200 bg-white" />
    </div>
  );
}
