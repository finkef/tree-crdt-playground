import Crdt from "./crdt"
import Fallback from "./fallback"
import Seed from "./seed"
import Sql from "./sql"
import Tree from "./tree"

export const routes = [
  {
    title: "Execute SQL",
    emoji: "💾",
    path: "/sql",
    element: <Sql />,
  },
  {
    title: "Seed Database",
    emoji: "🌱",
    path: "/seed",
    element: <Seed />,
  },
  {
    title: "Tree View",
    emoji: "🌲",
    path: "/tree",
    element: <Tree />,
  },
  {
    title: "CRDT",
    emoji: "🔄",
    path: "/crdt",
    element: <Crdt />,
  },
  {
    title: "",
    path: "",
    element: <Fallback />,
  },
  {
    title: "",
    path: "*",
    element: <Fallback />,
  },
]

const routesByPath = Object.fromEntries(
  routes.map((route) => [route.path, route])
)

export const getRouteTitle = (path: string) => {
  return routesByPath[path]?.title ?? ""
}
