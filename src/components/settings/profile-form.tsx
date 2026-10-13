"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { useActionFeedback } from "@/components/shared/action-feedback";
import { TranslatedFormMessage } from "@/components/shared/form-message";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type ProfileInput, profileSchema } from "@/lib/schemas/settings";
import { updateProfile } from "@/server/actions/settings";
import { TimezonePicker } from "./timezone-picker";

export function ProfileForm({ initial, email }: { initial: ProfileInput; email: string }) {
  const t = useTranslations("settings");
  const common = useTranslations("common");
  const handle = useActionFeedback();
  const [pending, startTransition] = useTransition();
  const form = useForm<ProfileInput>({ resolver: zodResolver(profileSchema), defaultValues: initial });

  return (
    <Form {...form}>
      <form
        className="space-y-5"
        noValidate
        onSubmit={form.handleSubmit((values) =>
          startTransition(async () => {
            if (handle(await updateProfile(values), t("saved"))) form.reset(values);
          }),
        )}
      >
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("name")}</FormLabel>
              <FormControl>
                <Input {...field} autoComplete="name" maxLength={80} />
              </FormControl>
              <TranslatedFormMessage />
            </FormItem>
          )}
        />
        <div className="space-y-2">
          <Label htmlFor="settings-email">{t("email")}</Label>
          <Input id="settings-email" value={email} readOnly disabled aria-describedby="settings-email-hint" />
          <p id="settings-email-hint" className="text-sm text-muted-foreground">
            {t("emailHint")}
          </p>
        </div>
        <FormField
          control={form.control}
          name="timezone"
          render={({ field, fieldState }) => (
            <FormItem>
              <FormLabel>{t("timezone")}</FormLabel>
              <FormControl>
                <TimezonePicker
                  value={field.value}
                  onChange={field.onChange}
                  invalid={Boolean(fieldState.error)}
                  searchPlaceholder={t("timezone")}
                  emptyLabel={common("none")}
                />
              </FormControl>
              <FormDescription>{t("timezoneHint")}</FormDescription>
              <TranslatedFormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={pending || !form.formState.isDirty}>
          {pending ? <Loader2 className="animate-spin" /> : null}
          {pending ? common("saving") : common("save")}
        </Button>
      </form>
    </Form>
  );
}
