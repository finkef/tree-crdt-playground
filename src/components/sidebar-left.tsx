import * as React from "react"

import { NavLinks } from "@/components/nav-links"
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarRail,
} from "@/components/ui/sidebar"
import { routes } from "@/routes"

export function SidebarLeft({
  ...props
}: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar className="border-r-0" {...props}>
      <SidebarHeader>
        <div className="flex w-fit items-center gap-2 px-1.5 h-10">
          <div className="flex aspect-square size-5 items-center justify-center rounded-md text-sidebar-primary-foreground">
            🌱
          </div>
          <span className="truncate font-semibold">Tree CRDT</span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <NavLinks links={routes} />
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  )
}
