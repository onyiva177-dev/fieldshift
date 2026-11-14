import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(1).max(128),
});

export const registerSchema = z
  .object({
    name: z.string().trim().min(2, "Enter your full name").max(100),
    email: z.string().trim().toLowerCase().email("Enter a valid email address").max(200),
    phone: z
      .string()
      .trim()
      .min(7, "Enter a valid phone number")
      .max(20)
      .regex(/^[+0-9 ()-]+$/, "Use digits, spaces, + or - only"),
    password: z.string().min(10, "Use at least 10 characters").max(72, "Use at most 72 characters"),
    role: z.enum(["farmer", "officer"]),
    officer: z
      .object({
        organization: z.string().trim().min(2, "Enter your organization").max(150),
        professionalRole: z.string().trim().min(2, "Enter your professional role").max(100),
        county: z.string().trim().min(2, "Enter your county").max(80),
        subCounty: z.string().trim().max(80).optional(),
      })
      .optional(),
  })
  .superRefine((v, ctx) => {
    if (v.role === "officer" && !v.officer) {
      ctx.addIssue({ code: "custom", path: ["officer"], message: "Officer details are required" });
    }
  });

export type RegisterInput = z.infer<typeof registerSchema>;
