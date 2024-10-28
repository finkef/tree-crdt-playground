import { useSyncExternalStore, useRef, useCallback } from "react"
import { DatabaseOptions, defaultDatabaseOptions } from "./statements"
import { Notifier } from "./notifier"
import { useSql } from "./use-sql"

export const useOpLog = (options: DatabaseOptions = defaultDatabaseOptions) => {
  const sql = useSql(options)
  const opLogCache = useRef<Awaited<ReturnType<typeof sql.opLog>>>({
    moves: [],
    elapsed: 0,
  })

  const getSnapshot = useCallback(() => {
    return opLogCache.current
  }, [])

  const subscribe = useCallback(
    (callback: () => void) => {
      // Wrap the notifier's callback to handle the async update
      return Notifier.subscribe(async () => {
        const newOpLog = await sql.opLog()
        opLogCache.current = newOpLog
        callback()
      }, options)
    },
    [sql, options]
  )

  // Initial fetch if cache is empty
  if (opLogCache.current === null) {
    // We can do this synchronously because useSyncExternalStore
    // will handle subsequent rerenders
    sql.opLog().then((opLog) => {
      opLogCache.current = opLog
    })
  }

  return useSyncExternalStore(subscribe, getSnapshot)
}
