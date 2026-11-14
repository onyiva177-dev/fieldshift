const styles: Record<string, string> = {
  pending: "bg-amber-100 text-amber-900",
  verified: "bg-green-100 text-green-900",
  rejected: "bg-red-100 text-red-900",
  needs_correction: "bg-orange-100 text-orange-900",
};
const labels: Record<string, string> = {
  pending: "Pending verification",
  verified: "Verified",
  rejected: "Rejected",
  needs_correction: "Needs correction",
};

export default function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-sm font-semibold ${styles[status] ?? "bg-stone-100 text-stone-900"}`}>
      {labels[status] ?? status}
    </span>
  );
}
