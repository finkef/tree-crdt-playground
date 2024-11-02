import { Move } from "./types"

export type Statement = {
  sql: string
  bindings?: any[]
}

export type DatabaseOptions = {
  tables: {
    nodes: string
    payloads: string
    opLog: string
  }
}

export const defaultDatabaseOptions: DatabaseOptions = {
  tables: {
    nodes: "nodes",
    payloads: "payloads",
    opLog: "op_log",
  },
}

/**
 * SQL tag.
 *
 * When used as a template tag, multiple SQL statements are accepted and
 * string interpolants can be used, e.g.
 * ```
 *   const statement = sql`
 *     PRAGMA integrity_check;
 *     SELECT * FROM ${tblName};
 *   `;
 * ```
 *
 * When called as a regular function, only one statement can be used
 * and SQLite placeholder substitution is performed, e.g.
 * ```
 *   const statement = sql('INSERT INTO tblName VALUES (?, ?)', [
 *     ['foo', 1],
 *     ['bar', 17],
 *     ['baz', 42]
 *   ]);
 * ```
 */
const sql = (
  sql: TemplateStringsArray | string,
  ...values: any[]
): Statement => {
  if (Array.isArray(sql)) {
    // Tag usage.
    const interleaved: any[] = []
    sql.forEach((s, i) => {
      interleaved.push(s, values[i])
    })
    return { sql: interleaved.join("") }
  } else {
    // Binding usage.
    return { sql: sql as string, bindings: values[0] }
  }
}

export const createTables = (
  options: DatabaseOptions = defaultDatabaseOptions
) => {
  return sql`
    -- Create tables
    CREATE TABLE IF NOT EXISTS ${options.tables.nodes} (
        id TEXT PRIMARY KEY,
        parent_id TEXT,
        FOREIGN KEY (parent_id) REFERENCES ${options.tables.nodes}(id)
    );
    CREATE TABLE IF NOT EXISTS ${options.tables.payloads} (
        node_id TEXT NOT NULL,
        content TEXT,
        timestamp INTEGER NOT NULL,
        FOREIGN KEY (node_id) REFERENCES ${options.tables.nodes}(id)
    );
    CREATE TABLE IF NOT EXISTS ${options.tables.opLog} (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL,
        node_id TEXT NOT NULL,
        old_parent_id TEXT,
        new_parent_id TEXT,
        source TEXT,
        synced_at INTEGER,
        FOREIGN KEY (node_id) REFERENCES ${options.tables.nodes}(id),
        FOREIGN KEY (old_parent_id) REFERENCES ${options.tables.nodes}(id),
        FOREIGN KEY (new_parent_id) REFERENCES ${options.tables.nodes}(id)
    );

    -- Create indexes
    CREATE INDEX IF NOT EXISTS idx_${options.tables.nodes}_parent_id ON ${options.tables.nodes}(parent_id);
    CREATE INDEX IF NOT EXISTS idx_${options.tables.opLog}_timestamp ON ${options.tables.opLog}(timestamp);
    CREATE INDEX IF NOT EXISTS idx_${options.tables.payloads}_node_id ON ${options.tables.payloads}(node_id);

    -- Create the root and tombstone nodes
    INSERT OR IGNORE INTO ${options.tables.nodes} (id, parent_id) VALUES ('ROOT', NULL);
    INSERT OR IGNORE INTO ${options.tables.nodes} (id, parent_id) VALUES ('TOMBSTONE', NULL);
  `
}

export const clearTables = (
  options: DatabaseOptions = defaultDatabaseOptions
) => {
  return sql`
    DELETE FROM ${options.tables.nodes} WHERE id != 'ROOT' AND id != 'TOMBSTONE';
    DELETE FROM ${options.tables.payloads};
    DELETE FROM ${options.tables.opLog};
  `
}

export const nodeCount = (
  options: DatabaseOptions = defaultDatabaseOptions
) => {
  return sql`SELECT COUNT(1) FROM ${options.tables.nodes}`
}

export const seed = (
  count: number,
  options: DatabaseOptions = defaultDatabaseOptions
) => {
  return sql`
    BEGIN;

    DELETE FROM ${options.tables.nodes};

    -- Create a temporary table to hold nodes before inserting into the main table
    CREATE TEMP TABLE temp_nodes (
        id TEXT PRIMARY KEY,
        parent_id TEXT
    );

    -- Insert the root node with a NULL parent_id
    INSERT INTO temp_nodes (id, parent_id) VALUES ('1', NULL);

    -- Define the number of nodes to create
    WITH RECURSIVE
        cnt(i) AS (
            SELECT 2
            UNION ALL
            SELECT i + 1 FROM cnt WHERE i < ${count}
        )
    -- Insert nodes with random parent_ids
    INSERT INTO temp_nodes (id, parent_id)
    SELECT CAST(i AS TEXT),
        CAST((ABS(RANDOM()) % (i - 1) + 1) AS TEXT)
    FROM cnt;

    -- Insert the generated nodes into the main 'nodes' table
    INSERT INTO ${options.tables.nodes} (id, parent_id)
    SELECT id, parent_id FROM temp_nodes;

    -- Clean up the temporary table
    DROP TABLE temp_nodes;

    END;
  `
}

export const tree = (options: DatabaseOptions = defaultDatabaseOptions) => {
  return sql`
    SELECT nodes.id, nodes.parent_id, payloads.content
    FROM ${options.tables.nodes} AS nodes
    LEFT JOIN ${options.tables.payloads} AS payloads ON nodes.id = payloads.node_id
  `
}

export const opLog = (options: DatabaseOptions = defaultDatabaseOptions) => {
  return sql`SELECT timestamp, node_id, old_parent_id, new_parent_id, source, synced_at FROM ${options.tables.opLog} ORDER BY timestamp DESC, seq DESC`
}

export const insertMoves = (
  moves: Move[],
  options: DatabaseOptions = defaultDatabaseOptions
) => {
  if (moves.length === 0) return sql`SELECT 1`

  const minTimestamp = Math.min(...moves.map((m) => m.timestamp))

  return sql`
    BEGIN TRANSACTION;

    -- Clean up any existing temporary tables
    DROP TABLE IF EXISTS temp_nodes;
    DROP TABLE IF EXISTS temp_undone_state;
    DROP TABLE IF EXISTS temp_final_state;

    -- Step 1: Create temp_undone_state
    CREATE TEMP TABLE temp_undone_state AS
    WITH ops_to_undo AS (
        SELECT seq, node_id, old_parent_id, new_parent_id, timestamp
        FROM ${options.tables.opLog}
        WHERE timestamp >= ${minTimestamp}
        ORDER BY timestamp DESC
    )
    SELECT id,
           COALESCE(
               (SELECT old_parent_id
                FROM ops_to_undo o
                WHERE o.node_id = ${options.tables.nodes}.id
                ORDER BY o.timestamp ASC
                LIMIT 1),
               parent_id
           ) AS parent_id
    FROM ${options.tables.nodes};

    -- Step 2: Insert the new operations
    INSERT INTO ${options.tables.opLog} 
      (timestamp, node_id, old_parent_id, new_parent_id, source, synced_at)
    VALUES 
      ${moves
        .map(
          (m) =>
            `(${m.timestamp}, '${m.node_id}', ${
              m.old_parent_id ? `'${m.old_parent_id}'` : "NULL"
            }, '${m.new_parent_id}', ${m.source ? `'${m.source}'` : "NULL"}, ${
              m.synced_at || "NULL"
            })`
        )
        .join(",")};

    -- Step 3: Create temp_final_state
    CREATE TEMP TABLE temp_final_state AS
    WITH RECURSIVE 
    ops_to_redo AS (
        SELECT seq, node_id, old_parent_id, new_parent_id, timestamp
        FROM ${options.tables.opLog}
        WHERE timestamp >= ${minTimestamp}
        ORDER BY timestamp ASC
    ),
    ancestors(child_id, ancestor_id) AS (
        -- Direct parent-child relationships from undone state
        SELECT id, parent_id 
        FROM temp_undone_state
        WHERE parent_id IS NOT NULL
        UNION ALL
        -- Recursive ancestor relationships
        SELECT a.child_id, t.parent_id
        FROM ancestors a
        JOIN temp_undone_state t ON t.id = a.ancestor_id
        WHERE t.parent_id IS NOT NULL
    )
    SELECT id,
           COALESCE(
               (
                   SELECT new_parent_id
                   FROM ops_to_redo o
                   WHERE o.node_id = temp_undone_state.id
                   -- Skip this move if it would create a cycle
                   AND NOT EXISTS (
                       SELECT 1 FROM ancestors 
                       WHERE child_id = o.new_parent_id 
                       AND ancestor_id = o.node_id
                   )
                   ORDER BY o.timestamp DESC
                   LIMIT 1
               ),
               parent_id
           ) AS new_parent_id
    FROM temp_undone_state;

    -- Step 4: Ensure all moved nodes exist
    INSERT OR IGNORE INTO ${options.tables.nodes} (id, parent_id)
    SELECT DISTINCT node_id, new_parent_id 
    FROM ${options.tables.opLog}
    WHERE timestamp >= ${minTimestamp};

    -- Step 5: Update nodes table (no need to check for cycles again)
    UPDATE ${options.tables.nodes}
    SET parent_id = (
        SELECT new_parent_id
        FROM temp_final_state
        WHERE temp_final_state.id = ${options.tables.nodes}.id
    )
    WHERE id IN (
        SELECT t.id 
        FROM temp_final_state t
        WHERE t.new_parent_id != ${options.tables.nodes}.parent_id
    );

    -- Clean up
    DROP TABLE temp_undone_state;
    DROP TABLE temp_final_state;

    COMMIT;
  `
}

export const markMovesSynced = (
  moveIds: { node_id: string; timestamp: number }[],
  syncedAt: number,
  options: DatabaseOptions = defaultDatabaseOptions
) => {
  const where = moveIds
    .map(
      (move) =>
        `(node_id = '${move.node_id}' AND timestamp = ${move.timestamp})`
    )
    .join(" OR ")

  return sql`
    UPDATE ${options.tables.opLog} 
    SET synced_at = ${syncedAt} 
    WHERE ${where}
  `
}
