"use client";

import { Loader2, MoreHorizontal, Pause, Pencil, Play, RefreshCw, RotateCcw, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
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
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Link, useRouter } from "@/i18n/navigation";
import { deleteRule, pauseRule, resumeRule, runRuleNow } from "@/server/actions/rules";

type RuleStatus = "active" | "paused" | "error" | "deleting";

function DeleteRuleDialog({
  ruleId,
  mirrorCount,
  open,
  onOpenChange,
  redirectTo,
}: {
  ruleId: string;
  mirrorCount: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  redirectTo?: string;
}) {
  const t = useTranslations("rules");
  const common = useTranslations("common");
  const handle = useActionFeedback();
  const router = useRouter();
  const [deleteMirrors, setDeleteMirrors] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("deleteTitle")}</AlertDialogTitle>
          <AlertDialogDescription>{t("deleteBody")}</AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex items-start gap-3 rounded-md border p-3">
          <Checkbox
            id={`delete-mirrors-${ruleId}`}
            checked={deleteMirrors}
            onCheckedChange={(value) => setDeleteMirrors(value === true)}
          />
          <Label htmlFor={`delete-mirrors-${ruleId}`} className="leading-snug font-normal">
            {mirrorCount === null ? t("deleteMirrorsUnknown") : t("deleteMirrors", { count: mirrorCount })}
          </Label>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{common("cancel")}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={pending}
            onClick={(event) => {
              event.preventDefault();
              startTransition(async () => {
                if (handle(await deleteRule(ruleId, { deleteMirrors }), t("deleted"))) {
                  onOpenChange(false);
                  if (redirectTo) router.push(redirectTo);
                }
              });
            }}
          >
            {pending ? <Loader2 className="animate-spin" /> : null}
            {t("deleteConfirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function useRuleCommands(ruleId: string) {
  const t = useTranslations("rules");
  const handle = useActionFeedback();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<Parameters<typeof handle>[0]>, success: string, refreshAfterSync = false) =>
    startTransition(async () => {
      if (handle(await fn(), success) && refreshAfterSync) {
        // The sync runs right after the action responds; pick up its result.
        for (const delay of [1500, 4000]) setTimeout(() => router.refresh(), delay);
      }
    });
  return {
    pending,
    syncNow: () => run(() => runRuleNow(ruleId), t("syncQueued"), true),
    resync: () => run(() => runRuleNow(ruleId, { full: true }), t("resyncQueued"), true),
    pause: () => run(() => pauseRule(ruleId), t("paused")),
    resume: () => run(() => resumeRule(ruleId), t("resumed")),
  };
}

/** Row actions menu on the rules list. */
export function RuleActionsMenu({
  ruleId,
  status,
  label,
}: {
  ruleId: string;
  status: RuleStatus;
  label: string;
}) {
  const t = useTranslations("rules");
  const common = useTranslations("common");
  const commands = useRuleCommands(ruleId);
  const [confirmDelete, setConfirmDelete] = useState(false);
  if (status === "deleting") return null;
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`${t("actions")}: ${label}`}
            disabled={commands.pending}
          >
            {commands.pending ? <Loader2 className="animate-spin" /> : <MoreHorizontal />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {status !== "paused" ? (
            <DropdownMenuItem onSelect={commands.syncNow}>
              <RefreshCw /> {t("syncNow")}
            </DropdownMenuItem>
          ) : null}
          {status === "paused" ? (
            <DropdownMenuItem onSelect={commands.resume}>
              <Play /> {t("resume")}
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onSelect={commands.pause}>
              <Pause /> {t("pause")}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem asChild>
            <Link href={`/rules/${ruleId}/edit`}>
              <Pencil /> {common("edit")}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
            <Trash2 /> {common("delete")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <DeleteRuleDialog
        ruleId={ruleId}
        mirrorCount={null}
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
      />
    </>
  );
}

/** Button row on the rule detail page. */
export function RuleDetailActions({
  ruleId,
  status,
  mirrorCount,
}: {
  ruleId: string;
  status: RuleStatus;
  mirrorCount: number;
}) {
  const t = useTranslations("rules");
  const common = useTranslations("common");
  const commands = useRuleCommands(ruleId);
  const [confirmDelete, setConfirmDelete] = useState(false);
  if (status === "deleting") return null;
  return (
    <div className="flex flex-wrap gap-2">
      {status !== "paused" ? (
        <>
          <Button onClick={commands.syncNow} disabled={commands.pending}>
            {commands.pending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            {t("syncNow")}
          </Button>
          <Button variant="outline" onClick={commands.resync} disabled={commands.pending}>
            <RotateCcw /> {t("resync")}
          </Button>
        </>
      ) : null}
      {status === "paused" ? (
        <Button onClick={commands.resume} disabled={commands.pending}>
          <Play /> {t("resume")}
        </Button>
      ) : (
        <Button variant="outline" onClick={commands.pause} disabled={commands.pending}>
          <Pause /> {t("pause")}
        </Button>
      )}
      <Button asChild variant="outline">
        <Link href={`/rules/${ruleId}/edit`}>
          <Pencil /> {common("edit")}
        </Link>
      </Button>
      <Button
        variant="outline"
        className="text-destructive hover:text-destructive"
        onClick={() => setConfirmDelete(true)}
      >
        <Trash2 /> {common("delete")}
      </Button>
      <DeleteRuleDialog
        ruleId={ruleId}
        mirrorCount={mirrorCount}
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        redirectTo="/rules"
      />
    </div>
  );
}
