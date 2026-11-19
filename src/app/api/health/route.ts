export const dynamic = "force-dynamic";

// Liveness check for uptime monitors. Reveals nothing about configuration.
export function GET() {
  return Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
}
