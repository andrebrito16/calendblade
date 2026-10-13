"use client";

import { Activity, Cable, LayoutDashboard, Settings, Workflow } from "lucide-react";
import { useTranslations } from "next-intl";
import { type ReactNode, Suspense } from "react";
import { LogoMark } from "@/components/brand/logo";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { Link, usePathname } from "@/i18n/navigation";
import { brand } from "@/lib/brand";

const items = [
  { href: "/dashboard", key: "dashboard", icon: LayoutDashboard },
  { href: "/connections", key: "connections", icon: Cable },
  { href: "/rules", key: "rules", icon: Workflow },
  { href: "/activity", key: "activity", icon: Activity },
  { href: "/settings", key: "settings", icon: Settings },
] as const;

function NavItems({ pathname }: { pathname: string | null }) {
  const t = useTranslations("nav");
  const { setOpenMobile } = useSidebar();
  return (
    <SidebarMenu>
      {items.map((item) => {
        const active = pathname !== null && (pathname === item.href || pathname.startsWith(`${item.href}/`));
        return (
          <SidebarMenuItem key={item.href}>
            <SidebarMenuButton asChild isActive={active} tooltip={t(item.key)}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                onClick={() => setOpenMobile(false)}
              >
                <item.icon aria-hidden="true" />
                <span>{t(item.key)}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}

/** Reads the URL for the active item; streams in behind Suspense. */
function ActiveNavItems() {
  return <NavItems pathname={usePathname()} />;
}

export function AppSidebar({ footer }: { footer: ReactNode }) {
  const t = useTranslations("nav");
  const { setOpenMobile } = useSidebar();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild size="lg" tooltip={brand.name}>
              <Link href="/dashboard" onClick={() => setOpenMobile(false)}>
                <LogoMark className="size-7!" />
                <span className="font-semibold tracking-tight">{brand.name}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <nav aria-label={t("mainNavigation")}>
              <Suspense fallback={<NavItems pathname={null} />}>
                <ActiveNavItems />
              </Suspense>
            </nav>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>{footer}</SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
