import { UnreachableCaseError } from "ts-essentials"
import * as SQLite from "wa-sqlite"
// @ts-ignore
import SQLiteESMFactory from "wa-sqlite/dist/wa-sqlite-async.mjs"
// @ts-ignore
import { OPFSCoopSyncVFS as VFS } from "wa-sqlite/src/examples/OPFSCoopSyncVFS.js"
import { Action } from "./actions"
import * as statements from "./statements"
import { sql } from "./statements"
import { Mutex } from "./mutex"

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

  // Create a mutex for moves in order to prevent race conditions without costly transactions.
  const movesMutex = new Mutex()

  /**
   * Executes a SQL statement and returns the results.
   */
  const execStatement = async ({ sql, bindings }: statements.Statement) => {
    const results = []
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

    return results
  }

  // Handle SQL from the main thread.
  messagePort.addEventListener("message", async (event) => {
    try {
      const action = event.data as Action

      switch (action.type) {
        case "exec": {
          const { sql, bindings } = action

          const start = performance.now()

          const results = await execStatement({ sql, bindings })

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

        case "insertMoves": {
          const { moves, options } = action

          const start = performance.now()

          if (moves.length === 0) {
            messagePort.postMessage({
              id: action.id,
              elapsed: 0,
            })
            break
          }

          await movesMutex.acquire()

          try {
            const minTimestamp = Math.min(...moves.map((m) => m.timestamp))

            // Insert all new moves into op_log and ensure nodes exist
            const values = moves
              .map(
                (move) => `(
                  ${move.timestamp}, 
                  '${move.node_id}', 
                  ${move.old_parent_id ? `'${move.old_parent_id}'` : "NULL"},
                  '${move.new_parent_id}',
                  ${move.source ? `'${move.source}'` : "NULL"},
                  ${move.synced_at || "NULL"}
                )`
              )
              .join(",\n    ")

            await execStatement(sql`
              BEGIN IMMEDIATE TRANSACTION;

              -- Create indexed temp table
              DROP TABLE IF EXISTS temp_nodes;
              CREATE TEMP TABLE temp_nodes (
                id TEXT PRIMARY KEY,
                parent_id TEXT
              ) WITHOUT ROWID;
              CREATE INDEX temp_nodes_parent_idx ON temp_nodes(parent_id);

              -- First insert moves
              INSERT INTO ${options.tables.opLog}
                (timestamp, node_id, old_parent_id, new_parent_id, source, synced_at)
              VALUES ${values};

              -- Populate temp table with current node state
              INSERT INTO temp_nodes 
              SELECT id, parent_id FROM ${options.tables.nodes};
              
              -- Ensure all nodes exist
              INSERT OR IGNORE INTO temp_nodes (id)
              SELECT DISTINCT node_id
              FROM ${options.tables.opLog}
              WHERE timestamp >= ${minTimestamp};

              INSERT OR IGNORE INTO ${options.tables.nodes} (id)
              SELECT DISTINCT node_id
              FROM ${options.tables.opLog}
              WHERE timestamp >= ${minTimestamp};

              -- Reset moved nodes to their state before minTimestamp
              UPDATE temp_nodes
              SET parent_id = (
                SELECT old_parent_id
                FROM ${options.tables.opLog}
                WHERE node_id = temp_nodes.id
                  AND timestamp >= ${minTimestamp}
                ORDER BY timestamp ASC
                LIMIT 1
              )
              WHERE id IN (
                SELECT DISTINCT node_id
                FROM ${options.tables.opLog}
                WHERE timestamp >= ${minTimestamp}
              );
            `)

            // Get and apply moves in timestamp order
            const allMovesResult = await execStatement(sql`
                SELECT node_id, new_parent_id, timestamp 
                FROM ${options.tables.opLog}
                WHERE timestamp >= ${minTimestamp}
                ORDER BY timestamp ASC, seq ASC
              `)

            // Apply valid moves in timestamp order
            for (const [nodeId, newParentId, timestamp] of allMovesResult[0]
              .rows) {
              if (nodeId === null || newParentId === null) continue

              await execStatement(sql`
                  WITH RECURSIVE ancestors(id) AS (
                    -- Start from the new parent
                    SELECT parent_id 
                    FROM temp_nodes
                    WHERE id = '${newParentId}'
                    
                    UNION ALL
                    
                    -- Follow parent links up using indexed temp table
                    SELECT n.parent_id 
                    FROM temp_nodes n
                    JOIN ancestors a ON n.id = a.id
                    WHERE n.parent_id IS NOT NULL
                  )
                  UPDATE temp_nodes
                  SET parent_id = CASE
                    -- Only update if the node isn't an ancestor (wouldn't create cycle)
                    WHEN NOT EXISTS (SELECT 1 FROM ancestors WHERE id = '${nodeId}')
                    THEN '${newParentId}'
                    -- Otherwise keep existing parent
                    ELSE parent_id
                  END
                  WHERE id = '${nodeId}';

                  -- Set creates_cycle flag in op_log if move was skipped
                  UPDATE ${options.tables.opLog}
                  SET creates_cycle = (
                    SELECT CASE 
                      WHEN parent_id = '${newParentId}' THEN FALSE
                      ELSE TRUE
                    END
                    FROM temp_nodes
                    WHERE id = '${nodeId}'
                  )
                  WHERE node_id = '${nodeId}' AND timestamp = ${timestamp};
                `)
            }

            // Copy final state back to nodes table
            await execStatement(sql`
              UPDATE ${options.tables.nodes}
              SET parent_id = (
                SELECT parent_id
                FROM temp_nodes
                WHERE temp_nodes.id = ${options.tables.nodes}.id
              );

              DROP TABLE IF EXISTS temp_nodes;

              COMMIT;
            `)

            const end = performance.now()

            messagePort.postMessage({
              id: action.id,
              elapsed: Math.trunc(end - start) / 1000,
            })
          } catch (error) {
            await execStatement(sql`
              DROP TABLE IF EXISTS temp_nodes;
              ROLLBACK;
            `)
            throw error
          } finally {
            movesMutex.release()
          }

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
