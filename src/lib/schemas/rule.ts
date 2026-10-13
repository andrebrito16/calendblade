import { z } from "zod";
import { eventColors } from "@/lib/colors";

const colorIds = eventColors.map((color) => color.id) as [string, ...string[]];

/** Options shared by create and edit (source/target are fixed after creation). */
export const ruleOptionsSchema = z.object({
  mode: z.enum(["full", "busy"]),
  busyTitle: z.string().trim().max(60, { error: "errors.tooLong60" }).optional().default(""),
  titlePrefix: z.string().trim().max(30, { error: "errors.tooLong30" }).optional().default(""),
  colorId: z
    .union([z.enum(colorIds), z.literal("")])
    .optional()
    .default(""),
  includeAllDay: z.boolean(),
  includeDeclined: z.boolean(),
  includeTentative: z.boolean(),
  includePrivate: z.boolean(),
  pastDays: z.coerce
    .number({ error: "errors.pastDaysRange" })
    .int({ error: "errors.pastDaysRange" })
    .min(0, { error: "errors.pastDaysRange" })
    .max(30, { error: "errors.pastDaysRange" }),
  futureDays: z.coerce
    .number({ error: "errors.futureDaysRange" })
    .int({ error: "errors.futureDaysRange" })
    .min(7, { error: "errors.futureDaysRange" })
    .max(365, { error: "errors.futureDaysRange" }),
});

export const createRuleSchema = ruleOptionsSchema
  .extend({
    sourceAccountId: z.string().min(1, { error: "errors.required" }),
    sourceCalendarId: z.string().min(1, { error: "errors.required" }),
    targetAccountId: z.string().min(1, { error: "errors.required" }),
    targetCalendarId: z.string().min(1, { error: "errors.required" }),
  })
  .refine((value) => value.sourceCalendarId !== value.targetCalendarId, {
    error: "rules.form.sameCalendar",
    path: ["targetCalendarId"],
  });

export type RuleOptionsInput = z.input<typeof ruleOptionsSchema>;
export type CreateRuleInput = z.input<typeof createRuleSchema>;

export const ruleDefaults = {
  mode: "busy" as const,
  busyTitle: "",
  titlePrefix: "",
  colorId: "",
  includeAllDay: true,
  includeDeclined: false,
  includeTentative: true,
  includePrivate: true,
  pastDays: 7,
  futureDays: 90,
};
