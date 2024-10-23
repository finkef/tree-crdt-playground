import { UnreachableCaseError } from "ts-essentials"
import * as SQLite from "wa-sqlite"
// @ts-ignore
import SQLiteESMFactory from "wa-sqlite/dist/wa-sqlite-async.mjs"
// @ts-ignore
import { OPFSCoopSyncVFS as VFS } from "wa-sqlite/src/examples/OPFSCoopSyncVFS.js"
import { Action } from "./actions"
import * as statements from "./statements"

const DB_NAME = "tree-test"

async function initSQLite() {
  const module = await SQLiteESMFactory()
  const sqlite3 = SQLite.Factory(module)
  const vfs = await VFS.create(DB_NAME, module)
  sqlite3.vfs_register(vfs, true)

  return sqlite3
}

async function setup() {
  // Set up communications with the main thread.
  const messagePort = await new Promise<MessagePort>((resolve) => {
    addEventListener("message", function handler(event) {
      if (event.data === "messagePort") {
        resolve(event.ports[0])
        removeEventListener("message", handler)
      }
    })
  })

  // Initialize SQLite.
  let sqlite3 = await initSQLite()
  let db = await sqlite3.open_v2(DB_NAME)

  await sqlite3.exec(db, statements.createTables().sql)

  // Handle SQL from the main thread.
  messagePort.addEventListener("message", async (event) => {
    try {
      const action = event.data as Action

      switch (action.type) {
        case "exec": {
          const { sql, bindings } = action

          const start = performance.now()
          const results = []
          //   for await (const stmt of sqlite3.statements(db, query)) {
          //     params.forEach((param, index) => {
          //       console.log("bind", params, index + 1, param)
          //       sqlite3.bind(stmt, index + 1, param)
          //     })

          //     const rows = []
          //     while ((await sqlite3.step(stmt)) === SQLite.SQLITE_ROW) {
          //       const row = sqlite3.row(stmt)
          //       rows.push(row)
          //     }

          //     const columns = sqlite3.column_names(stmt)
          //     if (columns.length) {
          //       results.push({ columns, rows })
          //     }
          //   }
          for await (const stmt of sqlite3.statements(db, sql)) {
            let columns: string[] | undefined
            for (const binding of bindings ?? [[]]) {
              sqlite3.reset(stmt)
              if (bindings) {
                sqlite3.bind_collection(stmt, binding)
              }

              const rows = []
              while ((await sqlite3.step(stmt)) === SQLite.SQLITE_ROW) {
                const row = sqlite3.row(stmt)
                rows.push(row)
              }

              columns = columns ?? sqlite3.column_names(stmt)
              if (columns.length) {
                results.push({ columns, rows })
              }
            }

            // When binding parameters, only a single statement is executed.
            if (bindings) {
              break
            }
          }

          const end = performance.now()

          messagePort.postMessage({
            id: action.id,
            results,
            elapsed: Math.trunc(end - start) / 1000,
          })
          break
        }

        case "reset": {
          await sqlite3.close(db)

          // Purge OPFS
          const root = await navigator.storage?.getDirectory()
          if (root) {
            // @ts-ignore
            for await (const name of root.keys()) {
              if (name.startsWith(DB_NAME)) {
                await root.removeEntry(name, { recursive: true }).catch(() => {
                  console.log("Failed to delete", name)
                })
              }
            }
          }

          // Reinitialize SQLite.
          sqlite3 = await initSQLite()
          db = await sqlite3.open_v2(DB_NAME)

          await sqlite3.exec(db, statements.createTables().sql)

          messagePort.postMessage({
            id: action.id,
          })

          break
        }

        default: {
          throw new UnreachableCaseError(action)
        }
      }
    } catch (error) {
      console.error(error)
      messagePort.postMessage({
        error: error instanceof Error ? error.message : String(error),
      })
    }
  })
  messagePort.start()
}

setup()
