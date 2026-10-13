"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronDown, EyeOff, FileText, Info, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { type Resolver, useForm } from "react-hook-form";
import { toast } from "sonner";
import { useActionFeedback } from "@/components/shared/action-feedback";
import { CalendarDot } from "@/components/shared/calendar-dot";
import { TranslatedFormMessage } from "@/components/shared/form-message";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Form, FormControl, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useRouter } from "@/i18n/navigation";
import type { ActionResult } from "@/lib/action-result";
import { eventColorHex, eventColors } from "@/lib/colors";
import { type CreateRuleInput, createRuleSchema, ruleDefaults, ruleOptionsSchema } from "@/lib/schemas/rule";
import { cn } from "@/lib/utils";
import { createRule, updateRule } from "@/server/actions/rules";
import type { AccountOption } from "@/server/queries/connections";
import { RulePreview } from "./rule-preview";

type FormValues = CreateRuleInput;

type Props =
  | { mode: "create"; accounts: AccountOption[]; afterCreate?: string }
  | {
      mode: "edit";
      ruleId: string;
      initial: Omit<
        FormValues,
        "sourceAccountId" | "sourceCalendarId" | "targetAccountId" | "targetCalendarId"
      >;
      fixedRoute: React.ReactNode;
      targetName: string;
    };

function FieldGroup({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-4 rounded-xl border bg-card p-5">
      <legend className="sr-only">{title}</legend>
      <div aria-hidden="true">
        <p className="font-semibold">{title}</p>
        {hint ? <p className="text-sm text-muted-foreground">{hint}</p> : null}
      </div>
      {children}
    </fieldset>
  );
}

export function RuleForm(props: Props) {
  const t = useTranslations("rules.form");
  const rulesT = useTranslations("rules");
  const router = useRouter();
  const handle = useActionFeedback();
  const [pending, startTransition] = useTransition();
  const [optionsOpen, setOptionsOpen] = useState(props.mode === "edit");
  const accounts =
    props.mode === "create" ? props.accounts.filter((account) => account.status === "active") : [];
  const firstAccount = accounts[0]?.id ?? "";

  const form = useForm<FormValues>({
    resolver: zodResolver(
      props.mode === "create" ? createRuleSchema : ruleOptionsSchema,
    ) as unknown as Resolver<FormValues>,
    defaultValues:
      props.mode === "create"
        ? {
            ...ruleDefaults,
            sourceAccountId: firstAccount,
            sourceCalendarId: "",
            targetAccountId: accounts[1]?.id ?? firstAccount,
            targetCalendarId: "",
          }
        : {
            ...props.initial,
            sourceAccountId: "-",
            sourceCalendarId: "-",
            targetAccountId: "-",
            targetCalendarId: "--",
          },
  });

  const values = form.watch();
  const sourceAccount = accounts.find((account) => account.id === values.sourceAccountId);
  const targetAccount = accounts.find((account) => account.id === values.targetAccountId);
  const targetCalendars = (targetAccount?.calendars ?? []).filter(
    (calendar) => calendar.writable && calendar.id !== values.sourceCalendarId,
  );
  const targetName =
    props.mode === "edit"
      ? props.targetName
      : (targetAccount?.calendars.find((calendar) => calendar.id === values.targetCalendarId)?.name ?? null);

  function onSubmit(data: FormValues) {
    startTransition(async () => {
      let result: ActionResult<{ id: string }>;
      if (props.mode === "create") {
        result = await createRule(data);
      } else {
        const { sourceAccountId, sourceCalendarId, targetAccountId, targetCalendarId, ...options } = data;
        result = await updateRule(props.ruleId, options);
      }
      if (!result.ok && result.error.code === "conflict") {
        form.setError("targetCalendarId", { message: "rules.form.ruleExists" });
        return;
      }
      if (!result.ok && result.error.fieldErrors) {
        for (const [field, messages] of Object.entries(result.error.fieldErrors)) {
          form.setError(field as keyof FormValues, { message: messages[0] });
        }
      }
      if (!handle(result)) return;
      if (props.mode === "create") {
        toast.success(rulesT("created"));
        router.push(props.afterCreate ?? `/rules/${result.data.id}`);
      } else {
        toast.success(rulesT("updated"));
        router.push(`/rules/${props.ruleId}`);
      }
    });
  }

  const calendarSelect = (
    name: "sourceCalendarId" | "targetCalendarId",
    calendars: AccountOption["calendars"],
  ) => (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem className="min-w-0 flex-1">
          <FormLabel>{t("calendar")}</FormLabel>
          <Select value={field.value} onValueChange={field.onChange} disabled={calendars.length === 0}>
            <FormControl>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={calendars.length === 0 ? t("noCalendars") : t("selectCalendar")} />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              {calendars.map((calendar) => (
                <SelectItem key={calendar.id} value={calendar.id}>
                  <CalendarDot color={calendar.color} />
                  {calendar.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <TranslatedFormMessage />
        </FormItem>
      )}
    />
  );

  const accountSelect = (
    name: "sourceAccountId" | "targetAccountId",
    resetField: "sourceCalendarId" | "targetCalendarId",
  ) => (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem className="min-w-0 flex-1">
          <FormLabel>{t("account")}</FormLabel>
          <Select
            value={field.value}
            onValueChange={(value) => {
              field.onChange(value);
              form.setValue(resetField, "");
            }}
          >
            <FormControl>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t("selectAccount")} />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              {accounts.map((account) => (
                <SelectItem key={account.id} value={account.id}>
                  {account.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <TranslatedFormMessage />
        </FormItem>
      )}
    />
  );

  const toggle = (
    name: "includeAllDay" | "includeDeclined" | "includeTentative" | "includePrivate",
    label: string,
  ) => (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem className="flex items-center justify-between gap-4 rounded-lg border px-3 py-2.5">
          <FormLabel className="font-normal">{label}</FormLabel>
          <FormControl>
            <Switch checked={field.value} onCheckedChange={field.onChange} />
          </FormControl>
        </FormItem>
      )}
    />
  );

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]"
        noValidate
      >
        <div className="space-y-6">
          {props.mode === "create" ? (
            <>
              <FieldGroup title={t("sourceTitle")} hint={t("sourceHint")}>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                  {accountSelect("sourceAccountId", "sourceCalendarId")}
                  {calendarSelect("sourceCalendarId", sourceAccount?.calendars ?? [])}
                </div>
              </FieldGroup>
              <FieldGroup title={t("targetTitle")} hint={t("targetHint")}>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                  {accountSelect("targetAccountId", "targetCalendarId")}
                  {calendarSelect("targetCalendarId", targetCalendars)}
                </div>
              </FieldGroup>
            </>
          ) : (
            <div className="rounded-xl border bg-card p-5">{props.fixedRoute}</div>
          )}

          <FieldGroup title={t("modeTitle")}>
            <FormField
              control={form.control}
              name="mode"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <RadioGroup
                      value={field.value}
                      onValueChange={field.onChange}
                      className="grid gap-3 sm:grid-cols-2"
                      aria-label={t("modeTitle")}
                    >
                      {(
                        [
                          ["full", FileText, rulesT("modeFull"), t("modeFullHint")],
                          ["busy", EyeOff, rulesT("modeBusy"), t("modeBusyHint")],
                        ] as const
                      ).map(([value, Icon, label, hint]) => (
                        <label
                          key={value}
                          htmlFor={`mode-${value}`}
                          className={cn(
                            "flex cursor-pointer gap-3 rounded-lg border p-4 transition-colors has-focus-visible:ring-2 has-focus-visible:ring-ring",
                            field.value === value ? "border-primary bg-primary/5" : "hover:bg-accent/50",
                          )}
                        >
                          <RadioGroupItem id={`mode-${value}`} value={value} className="mt-0.5" />
                          <span className="space-y-1">
                            <span className="flex items-center gap-1.5 font-medium">
                              <Icon className="size-4" aria-hidden="true" /> {label}
                            </span>
                            <span className="block text-sm text-muted-foreground">{hint}</span>
                          </span>
                        </label>
                      ))}
                    </RadioGroup>
                  </FormControl>
                </FormItem>
              )}
            />
          </FieldGroup>

          <Collapsible open={optionsOpen} onOpenChange={setOptionsOpen} className="rounded-xl border bg-card">
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex w-full items-center justify-between rounded-xl p-5 text-left font-semibold focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                {t("optionsTitle")}
                <ChevronDown
                  className={cn("size-4 transition-transform", optionsOpen && "rotate-180")}
                  aria-hidden="true"
                />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-5 px-5 pb-5">
              {values.mode === "busy" ? (
                <FormField
                  control={form.control}
                  name="busyTitle"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("busyTitleLabel")}</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder={t("busyTitlePlaceholder")} maxLength={60} />
                      </FormControl>
                      <TranslatedFormMessage />
                    </FormItem>
                  )}
                />
              ) : (
                <FormField
                  control={form.control}
                  name="titlePrefix"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("titlePrefixLabel")}</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder={t("titlePrefixPlaceholder")} maxLength={30} />
                      </FormControl>
                      <TranslatedFormMessage />
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={form.control}
                name="colorId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel id="color-label">{t("colorLabel")}</FormLabel>
                    <RadioGroup
                      value={field.value ?? ""}
                      onValueChange={field.onChange}
                      aria-labelledby="color-label"
                      className="flex flex-wrap gap-2"
                    >
                      {/* biome-ignore lint/a11y/noLabelWithoutControl: wraps a Radix radio (button role="radio") */}
                      <label
                        className={cn(
                          "flex h-8 cursor-pointer items-center rounded-full border px-3 text-xs has-focus-visible:ring-2 has-focus-visible:ring-ring",
                          !field.value && "border-primary bg-primary/5",
                        )}
                      >
                        <RadioGroupItem value="" className="sr-only" />
                        {t("colorDefault")}
                      </label>
                      {eventColors.map((color) => (
                        // biome-ignore lint/a11y/noLabelWithoutControl: wraps a Radix radio (button role="radio")
                        <label
                          key={color.id}
                          title={rulesT(`colors.${color.id}` as "colors.1")}
                          className={cn(
                            "flex size-8 cursor-pointer items-center justify-center rounded-full border-2 has-focus-visible:ring-2 has-focus-visible:ring-ring",
                            field.value === color.id ? "border-foreground" : "border-transparent",
                          )}
                        >
                          <RadioGroupItem
                            value={color.id}
                            className="sr-only"
                            aria-label={rulesT(`colors.${color.id}` as "colors.1")}
                          />
                          <span className="size-5 rounded-full" style={{ backgroundColor: color.hex }} />
                        </label>
                      ))}
                    </RadioGroup>
                  </FormItem>
                )}
              />

              <div className="grid gap-2 sm:grid-cols-2">
                {toggle("includeAllDay", t("includeAllDay"))}
                {toggle("includeTentative", t("includeTentative"))}
                {toggle("includeDeclined", t("includeDeclined"))}
                {toggle("includePrivate", t("includePrivate"))}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {(["pastDays", "futureDays"] as const).map((name) => (
                  <FormField
                    key={name}
                    control={form.control}
                    name={name}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t(name)}</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            inputMode="numeric"
                            min={name === "pastDays" ? 0 : 7}
                            max={name === "pastDays" ? 30 : 365}
                            {...field}
                            value={field.value as number}
                            onChange={(event) =>
                              field.onChange(event.target.value === "" ? "" : Number(event.target.value))
                            }
                          />
                        </FormControl>
                        <TranslatedFormMessage />
                      </FormItem>
                    )}
                  />
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>

          <div className="space-y-2 text-sm text-muted-foreground">
            <p className="flex gap-2">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> {t("recurringNote")}
            </p>
            {props.mode === "create" ? (
              <p className="flex gap-2">
                <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> {t("twoWayHint")}
              </p>
            ) : null}
          </div>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <RulePreview
            mode={values.mode}
            busyTitle={values.busyTitle ?? ""}
            titlePrefix={values.titlePrefix ?? ""}
            color={eventColorHex(values.colorId)}
            targetName={targetName}
          />
          <Button type="submit" size="lg" className="w-full" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : null}
            {props.mode === "create" ? t("submitCreate") : t("submitUpdate")}
          </Button>
        </aside>
      </form>
    </Form>
  );
}
