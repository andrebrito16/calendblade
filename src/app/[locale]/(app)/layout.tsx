import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { AppSidebar } from "@/components/app/app-sidebar";
import { AppBanners } from "@/components/app/banners";
import { Breadcrumbs } from "@/components/app/breadcrumbs";
import { SidebarUser } from "@/components/app/sidebar-user";
import { SyncIndicator } from "@/components/app/sync-indicator";
import { ConsentSync } from "@/components/consent/consent-sync";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";

function SidebarUserSkeleton() {
  return (
    <div className="flex h-12 items-center gap-2 px-2" aria-hidden="true">
      <Skeleton className="size-8 shrink-0 rounded-lg" />
      <div className="flex-1 space-y-1.5 group-data-[collapsible=icon]:hidden">
        <Skeleton className="h-3 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    </div>
  );
}

/**
 * App shell. The chrome renders statically; everything personalized (user
 * menu, banners) streams behind Suspense so the session never blocks it.
 */
export default async function AppLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  const nav = await getTranslations({ locale, namespace: "nav" });
  const common = await getTranslations({ locale, namespace: "common" });

  return (
    <SidebarProvider>
      <ConsentSync />
      <AppSidebar
        footer={
          <Suspense fallback={<SidebarUserSkeleton />}>
            <SidebarUser locale={locale} />
          </Suspense>
        }
      />
      <SidebarInset>
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b bg-background/85 px-4 backdrop-blur md:px-6">
          <SidebarTrigger className="-ml-1" aria-label={common("openMenu")} />
          <Separator orientation="vertical" className="mr-1 data-[orientation=vertical]:h-4" />
          <Suspense fallback={null}>
            <Breadcrumbs
              detailLabels={{
                new: nav("breadcrumbNew"),
                edit: common("edit"),
                billing: nav("billing"),
                detail: nav("breadcrumbDetails"),
              }}
            />
          </Suspense>
          <div className="ml-auto flex items-center gap-2">
            <SyncIndicator />
            <ThemeToggle />
          </div>
        </header>
        <Suspense fallback={null}>
          <AppBanners locale={locale} />
        </Suspense>
        <div id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:px-8 md:py-8">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
