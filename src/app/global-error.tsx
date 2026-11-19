"use client";

// Last-resort page if the root layout itself fails. Plain HTML, no dependencies.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: "4rem 1rem", textAlign: "center" }}>
        <h1>Field Shift is having a problem</h1>
        <p>Please try again in a moment.</p>
        <button onClick={reset} style={{ padding: "0.75rem 1.25rem", fontSize: "1rem" }}>Try again</button>
      </body>
    </html>
  );
}
