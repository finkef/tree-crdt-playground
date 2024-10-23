import Root from "@/routes/root"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { createBrowserRouter, RouterProvider } from "react-router-dom"
import "./index.css"
import { WorkerProvider } from "./lib/sql/worker-context"
import { routes } from "./routes"

const router = createBrowserRouter([
  {
    path: "/",
    element: <Root />,
    children: routes,
  },
])

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <WorkerProvider>
      <RouterProvider router={router} />
    </WorkerProvider>
  </StrictMode>
)
