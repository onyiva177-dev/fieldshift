"use client";

import { useFormStatus } from "react-dom";

interface Props {
  children: React.ReactNode;
  pendingText?: string;
  className?: string;
  name?: string;
  value?: string;
}

/** Submit button that shows progress and blocks double clicks. Place it inside a <form action={...}>. */
export default function SubmitButton({ children, pendingText = "Working...", className = "btn-primary", name, value }: Props) {
  const { pending, data } = useFormStatus();
  // with several buttons in one form, only the one that was pressed shows the progress text
  const mine = pending && (name === undefined || data?.get(name) === value);

  return (
    <button
      type="submit"
      name={name}
      value={value}
      disabled={pending}
      aria-busy={mine}
      className={`${className} disabled:cursor-wait disabled:opacity-60`}
    >
      {mine ? (
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
