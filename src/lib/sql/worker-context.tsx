import SQLWorker from "@/lib/sql/worker?worker"
import { createContext, useContext } from "react"
import * as actions from "./actions"
import { DatabaseOptions, type Statement } from "./statements"
import { Move } from "./types"

const worker = new SQLWorker()

const { port1, port2 } = new MessageChannel()

// Register the port with the worker.
worker.postMessage("messagePort", [port2])

// Map of pending callbacks.
const pendingCallbacks = new Map<string, (result: any) => void>()

/**
 * Wait for a result from the worker.
 */
const waitForResult = (action: actions.Action): Promise<any> =>
  new Promise((resolve) => {
    port1.postMessage(action)
    pendingCallbacks.set(action.id, resolve)
  })

const context = {
  exec: async (
    statement: Statement
  ): Promise<{
    id: string
    elapsed: number
    results: Array<{ columns: string[]; rows: any[] }>
  }> => waitForResult(actions.exec(statement)),
  reset: () => waitForResult(actions.reset()),
  insertMoves: async (moves: Move[], options: DatabaseOptions) =>
    waitForResult(actions.insertMoves(moves, options)),
}

port1.addEventListener("message", (event) => {
  if (event.data.id) {
    const callback = pendingCallbacks.get(event.data.id)
    pendingCallbacks.delete(event.data.id)

    callback?.(event.data)
  }
})
port1.start()

const WorkerContext = createContext<typeof context>(context)

export const WorkerProvider = ({ children }: { children: React.ReactNode }) => {
  return (
    <WorkerContext.Provider value={context}>{children}</WorkerContext.Provider>
  )
}

/**
 * Low-level interface to the webworker.
 */
export const useWorker = () => useContext(WorkerContext)
