"use client";

import { ExternalLink, Loader2, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { useActionFeedback } from "@/components/shared/action-feedback";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { brand } from "@/lib/brand";
import type { PlanId } from "@/lib/plans";
import { removeAllMirrors } from "@/server/actions/billing";

/**
 * Starts Stripe Checkout (new subscription or trial) or switches the plan of
 * an existing subscription. Redirects to Stripe.
 */
export function CheckoutButton({
  plan,
  label,
  subscriptionId,
  successUrl,
  cancelUrl,
  variant = "default",
  className,
  disabled,
}: {
  plan: PlanId;
  label: string;
  subscriptionId?: string | null;
  successUrl: string;
  cancelUrl: string;
  variant?: "default" | "outline";
  className?: string;
  disabled?: boolean;
}) {
  const t = useTranslations("billing");
  const [pending, setPending] = useState(false);
  return (
    <Button
      variant={variant}
      className={className}
      disabled={pending || disabled}
      onClick={async () => {
        setPending(true);
        const { error } = await authClient.subscription.upgrade({
          plan,
          successUrl,
          cancelUrl,
          returnUrl: successUrl,
          ...(subscriptionId ? { subscriptionId } : {}),
        });
        if (error) {
          toast.error(t("checkoutError"));
          setPending(false);
        }
      }}
    >
      {pending ? <Loader2 className="animate-spin" /> : null}
      {label}
    </Button>
  );
}

export function PortalButton({
  label,
  variant = "outline",
}: {
  label: string;
  variant?: "default" | "outline";
}) {
  const t = useTranslations("billing");
  const [pending, setPending] = useState(false);
  return (
    <Button
      variant={variant}
      disabled={pending}
      onClick={async () => {
        setPending(true);
        const { error } = await authClient.subscription.billingPortal({ returnUrl: "/settings/billing" });
        if (error) {
          toast.error(t("portalError"));
          setPending(false);
        }
      }}
    >
      {pending ? <Loader2 className="animate-spin" /> : <ExternalLink />}
      {label}
    </Button>
  );
}

export function RemoveMirrorsButton() {
  const t = useTranslations("billing");
  const common = useTranslations("common");
  const handle = useActionFeedback();
  const [pending, startTransition] = useTransition();
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline">
          <Trash2 /> {t("removeMirrors")}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("removeMirrorsTitle")}</AlertDialogTitle>
          <AlertDialogDescription>{t("removeMirrorsBody", { brand: brand.name })}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{common("cancel")}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                handle(await removeAllMirrors(), t("removeMirrorsQueued"));
              })
            }
          >
            {t("removeMirrors")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
