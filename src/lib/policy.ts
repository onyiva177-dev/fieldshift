import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import type { Role, SessionUser } from "@/lib/types";

// Database Row Level Security is the real enforcement. These helpers give clean redirects
// and errors in the app, and stop server actions early.
export class AccessError extends Error {
  constructor(message = "You do not have permission to do this.") {
    super(message);
    this.name = "AccessError";
  }
}

/** For pages: redirect to login when signed out. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

/** For pages: send signed-in users without the right role back to the dashboard. */
export async function requireRolePage(allowed: Role[]): Promise<SessionUser> {
  const user = await requireUser();
  if (!allowed.includes(user.role)) redirect("/dashboard");
  return user;
}

/** For server actions: throw when the user lacks the role. */
export async function requireRoleAction(allowed: Role[]): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new AccessError("Sign in to continue.");
  if (!allowed.includes(user.role)) throw new AccessError();
  return user;
}
