import { useMemo } from "react"
import { useWorker } from "./worker-context"
import * as statements from "./statements"

// Helper to turn a row into an object with specific columns
const withColumns = (rows: any[][], columns: string[]) => {
  return rows.map((row) =>
    Object.fromEntries(columns.map((column, i) => [column, row[i]]))
  )
}

/**
 * High-level SQL interface.
 */
export const useSql = () => {
  const worker = useWorker()

  const callbacks = useMemo(
    () => ({
      reset: worker.reset,
      nodeCount: async () => {
        const result = await worker.exec(statements.nodeCount())
        return {
          count: result.results[0].rows[0][0] as number,
          elapsed: result.elapsed,
        }
      },
      seed: async (count: number) => {
        const result = await worker.exec(statements.seed(count))
        return {
          elapsed: result.elapsed,
        }
      },
      tree: async () => {
        const result = await worker.exec(statements.tree())
        return {
          nodes: withColumns(result.results[0].rows, [
            "id",
            "parent_id",
            "content",
          ]) as {
            id: string
            parent_id: string
            content: string
          }[],
          elapsed: result.elapsed,
        }
      },
    }),
    []
  )

  return callbacks
}
