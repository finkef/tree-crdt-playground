import { DatabaseOptions, defaultDatabaseOptions } from "./statements"

const listeners: Record<string, Set<() => void>> = {}

export const Notifier = {
  subscribe: (
    callback: () => void,
    options: DatabaseOptions = defaultDatabaseOptions
  ) => {
    const key = options.tables.opLog

    if (!listeners[key]) {
      listeners[key] = new Set()
    }

    listeners[key].add(callback)

    return () => {
      listeners[key].delete(callback)
    }
  },

  notify: (options: DatabaseOptions = defaultDatabaseOptions) => {
    const key = options.tables.opLog

    if (listeners[key]) {
      listeners[key].forEach((callback) => callback())
    }
  },
}
