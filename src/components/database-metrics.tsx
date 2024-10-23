import { RotateCcw } from "lucide-react"
import { Button } from "./ui/button"
import { Progress } from "./ui/progress"
import { Switch } from "./ui/switch"
import { useEffect, useState } from "react"
import { useSql } from "@/lib/sql/use-sql"

declare global {
  interface Performance {
    memory: {
      usedJSHeapSize: number
      jsHeapSizeLimit: number
    }
  }
}

export function DatabaseMetrics() {
  const sql = useSql()

  const [isResetting, setIsResetting] = useState(false)
  const [nodeCount, setNodeCount] = useState<number | null>(null)
  const [memoryUsage, setMemoryUsage] = useState<{
    used: number
    limit: number
  } | null>(
    performance.memory
      ? {
          used: performance.memory.usedJSHeapSize,
          limit: performance.memory.jsHeapSizeLimit,
        }
      : null
  )

  useEffect(() => {
    const interval = setInterval(() => {
      sql.nodeCount().then(({ count }) => setNodeCount(count))

      if (performance.memory) {
        setMemoryUsage({
          used: performance.memory.usedJSHeapSize,
          limit: performance.memory.jsHeapSizeLimit,
        })
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [])

  const reset = async () => {
    setIsResetting(true)
    await sql.reset()
    setIsResetting(false)
  }

  return (
    <div className="space-y-6 p-4">
      <div className="space-y-1">
        <h4 className="text-sm font-medium">Total Rows</h4>
        <p className="text-2xl font-bold">
          {typeof nodeCount === "number"
            ? nodeCount.toLocaleString()
            : "Calculating..."}
        </p>
      </div>
      <div className="space-y-1">
        <h4 className="text-sm font-medium">Memory Usage</h4>
        <div className="flex items-center gap-2">
          <Progress
            value={
              memoryUsage ? (memoryUsage.used / (600 * 1024 * 1024)) * 100 : 0
            }
            className="h-2 flex-1"
          />
          <span className="text-sm tabular-nums">
            {memoryUsage
              ? `${(memoryUsage.used / 1024 / 1024).toFixed(2)}MB`
              : "-"}
          </span>
        </div>
      </div>
      <div className="space-y-3">
        <h4 className="text-sm font-medium">Controls</h4>
        <div className="flex items-center justify-between">
          <span className="text-sm">Network</span>
          <Switch checked={true} />
        </div>
      </div>

      <div className="space-y-3">
        <h4 className="text-sm font-medium">Actions</h4>
        <div className="grid grid-cols-1 gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={reset}
            disabled={isResetting}
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            Reset
          </Button>
        </div>
      </div>
    </div>
  )
}
