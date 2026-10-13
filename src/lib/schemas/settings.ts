import { z } from "zod";
import { isValidTimezone } from "@/lib/timezones";

export const profileSchema = z.object({
  name: z.string().trim().min(1, { error: "errors.required" }).max(80, { error: "errors.tooLong80" }),
  timezone: z.string().refine(isValidTimezone, { error: "errors.invalidTimezone" }),
});

export const notificationsSchema = z.object({ emailNotifications: z.boolean() });

export const deleteAccountSchema = z.object({
  deleteMirrors: z.boolean(),
  confirm: z.literal("DELETE", { error: "errors.confirmDelete" }),
});

export type ProfileInput = z.input<typeof profileSchema>;
