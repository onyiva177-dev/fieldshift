import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Role, SessionUser } from "@/lib/types";

// Returns the signed-in user with their role, or null. Cached per request.
// getClaims() checks the signed token locally when the project uses asymmetric signing keys
// (the Supabase default for new projects), and falls back to asking Supabase otherwise.
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;

  const [roleRes, profileRes] = await Promise.all([
    supabase.from("user_roles").select("role").eq("user_id", claims.sub).maybeSingle(),
    supabase.from("profiles").select("full_name").eq("id", claims.sub).maybeSingle(),
  ]);

  return {
    id: claims.sub,
    email: typeof claims.email === "string" ? claims.email : "",
    name: profileRes.data?.full_name ?? (typeof claims.email === "string" ? claims.email : ""),
    role: (roleRes.data?.role as Role) ?? "farmer",
  };
});
