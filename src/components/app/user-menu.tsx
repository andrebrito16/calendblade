"use client";

import { ChevronsUpDown, CreditCard, LogOut, Settings } from "lucide-react";
import { useTranslations } from "next-intl";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar";
import { Link } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";
import { useUser } from "./user-provider";

function initials(name: string, email: string) {
  const source = name.trim() || email;
  const parts = source.split(/[\s@.]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

export function UserMenu({ planLabel, showBilling }: { planLabel: string | null; showBilling: boolean }) {
  const t = useTranslations("nav");
  const user = useUser();
  const { isMobile } = useSidebar();

  async function signOut() {
    await authClient.signOut();
    window.location.assign("/");
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent"
              aria-label={t("account")}
            >
              <Avatar className="size-8 rounded-lg">
                {user.image ? <AvatarImage src={user.image} alt="" /> : null}
                <AvatarFallback className="rounded-lg text-xs">
                  {initials(user.name, user.email)}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{user.name || user.email}</span>
                <span className="truncate text-xs text-muted-foreground">{planLabel ?? user.email}</span>
              </div>
              <ChevronsUpDown className="ml-auto size-4" aria-hidden="true" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="font-normal">
              <div className="grid text-sm leading-tight">
                <span className="truncate font-medium">{user.name}</span>
                <span className="truncate text-xs text-muted-foreground">{user.email}</span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem asChild>
                <Link href="/settings">
                  <Settings /> {t("settings")}
                </Link>
              </DropdownMenuItem>
              {showBilling ? (
                <DropdownMenuItem asChild>
                  <Link href="/settings/billing">
                    <CreditCard /> {t("billing")}
                  </Link>
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={signOut}>
              <LogOut /> {t("signOut")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
