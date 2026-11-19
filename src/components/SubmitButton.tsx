"use client";

import { useFormStatus } from "react-dom";

interface Props {
  children: React.ReactNode;
  pendingText?: string;
  className?: string;
}

/**
 * Submit button that shows progress and blocks double clicks. Place it inside a <form action={...}>.
 * It deliberately has no name/value: React does not send a button's name/value with server-action forms,
 * so anything the action needs must be in hidden inputs (use one form per button).
 */
export default function SubmitButton({ children, pendingText = "Working...", className = "btn-primary" }: Props) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-busy={pending} className={`${className} disabled:cursor-wait disabled:opacity-60`}>
      {pending ? (
        <span className="inline-flex items-center gap-2">
          <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          {pendingText}
        </span>
      ) : (
        children
      )}
    </button>
  );
}
