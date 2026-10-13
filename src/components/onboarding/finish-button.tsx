"use client";

import { ArrowRight, Loader2 } from "lucide-react";
import { useTransition } from "react";
import { useActionFeedback } from "@/components/shared/action-feedback";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { completeOnboarding } from "@/server/actions/settings";

export function FinishOnboardingButton({ label }: { label: string }) {
  const handle = useActionFeedback();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="lg"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          if (handle(await completeOnboarding())) router.push("/dashboard");
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" /> : null}
      {label} <ArrowRight />
    </Button>
  );
}
