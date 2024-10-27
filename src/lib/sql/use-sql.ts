import { useMemo } from "react"
import { useWorker } from "./worker-context"
import * as statements from "./statements"
import { Notifier } from "./notifier"
import { Move } from "./types"

// Helper to turn a row into an object with specific columns
const withColumns = (rows: any[][], columns: string[]) => {
  return rows.map((row) =>
    Object.fromEntries(columns.map((column, i) => [column, row[i]]))
  )
}

/**
 * High-level SQL interface.
 */
export const useSql = (options?: statements.DatabaseOptions) => {
  const worker = useWorker()

  const callbacks = useMemo(
    () => ({
      reset: worker.reset,
      /**
       * Initializes tables in the database, only needed on non-default tables.
       */
      init: async () => {
        await worker.exec(statements.createTables(options))
        Notifier.notify(options)
      },
      /**
       * Clears all tables in the database.
       */
      clear: async () => {
        await worker.exec(statements.clearTables(options))
        Notifier.notify(options)
      },
      /**
       * Returns the number of nodes in the database.
       */
      nodeCount: async () => {
        const result = await worker.exec(statements.nodeCount(options))
        return {
          count: result.results[0].rows[0][0] as number,
          elapsed: result.elapsed,
        }
      },
      /**
       * Seeds the database with a given number of nodes.
       */
      seed: async (count: number) => {
        const result = await worker.exec(statements.seed(count, options))
        Notifier.notify(options)
        return {
          elapsed: result.elapsed,
        }
      },
      /**
       * Returns the entire tree of nodes in the database.
       */
      tree: async () => {
        const result = await worker.exec(statements.tree(options))
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
      /**
       * Inserts a list of moves into the database.
       */
      insertMoves: async (moves: Move[]) => {
        const result = await worker.exec(statements.insertMoves(moves, options))
        Notifier.notify(options)

        return {
          elapsed: result.elapsed,
        }
      },
    }),
    [options]
  )

  return callbacks
}
