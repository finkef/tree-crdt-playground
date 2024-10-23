import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { Link } from "react-router-dom"

export function NavLinks({
  links,
}: {
  links: {
    title: string
    path: string
    emoji?: string
  }[]
}) {
  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel>Tools</SidebarGroupLabel>
      <SidebarMenu>
        {links.map((item) => {
          if (item.path === "" || item.path === "*") return null

          return (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton asChild>
                <Link to={item.path} title={item.title}>
                  <span>{item.emoji}</span>
                  <span>{item.title}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )
        })}
      </SidebarMenu>
    </SidebarGroup>
  )
}
