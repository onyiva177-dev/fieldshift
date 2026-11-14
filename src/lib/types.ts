export type Role = "farmer" | "officer" | "admin";
export type OfficerVerification = "pending" | "verified" | "rejected";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}
