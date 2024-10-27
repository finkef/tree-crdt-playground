import { useSyncExternalStore, useRef, useCallback } from "react"
import { DatabaseOptions, defaultDatabaseOptions } from "./statements"
import { Notifier } from "./notifier"
import { useSql } from "./use-sql"

export const useTree = (options: DatabaseOptions = defaultDatabaseOptions) => {
  const sql = useSql(options)
  const treeCache = useRef<Awaited<ReturnType<typeof sql.tree>>>({
    nodes: [],
    elapsed: 0,
  })

  const getSnapshot = useCallback(() => {
    return treeCache.current
  }, [])

  const subscribe = useCallback(
    (callback: () => void) => {
      // Wrap the notifier's callback to handle the async update
      return Notifier.subscribe(async () => {
        const newTree = await sql.tree()
        treeCache.current = newTree
        callback()
      }, options)
    },
    [sql, options]
  )

  // Initial fetch if cache is empty
  if (treeCache.current === null) {
    // We can do this synchronously because useSyncExternalStore
    // will handle subsequent rerenders
    sql.tree().then((tree) => {
      treeCache.current = tree
    })
  }

  return useSyncExternalStore(subscribe, getSnapshot)
}
