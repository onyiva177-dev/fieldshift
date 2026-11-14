import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Role, SessionUser } from "@/lib/types";

// Returns the signed-in user with their role, or null. Cached per request.
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [roleRes, profileRes] = await Promise.all([
    supabase.from("user_roles").select("role").eq("user_id", user.id).maybeSingle(),
    supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
  ]);

  return {
    id: user.id,
    email: user.email ?? "",
    name: profileRes.data?.full_name ?? user.email ?? "",
    role: (roleRes.data?.role as Role) ?? "farmer",
  };
});
