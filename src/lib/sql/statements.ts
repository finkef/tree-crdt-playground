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

    -- Create temporary tables for the operations
    CREATE TABLE IF NOT EXISTS temp_undone_state_${options.tables.opLog} (
        id TEXT PRIMARY KEY,
        parent_id TEXT
    );
    CREATE TABLE IF NOT EXISTS temp_final_state_${options.tables.opLog} (
        id TEXT PRIMARY KEY,
        new_parent_id TEXT
    );

    -- Drop the trigger if it exists
    DROP TRIGGER IF EXISTS crdt_insert_${options.tables.opLog};

    -- Create the trigger
    CREATE TRIGGER IF NOT EXISTS crdt_insert_${options.tables.opLog}
    AFTER INSERT ON ${options.tables.opLog}
    BEGIN
        -- Step 0: Ensure the node exists
        INSERT OR IGNORE INTO ${options.tables.nodes} (id, parent_id)
        VALUES (NEW.node_id, NULL);
        
        -- Clear temporary tables
        DELETE FROM temp_undone_state_${options.tables.opLog};
        DELETE FROM temp_final_state_${options.tables.opLog};
        
        -- Step 1: Insert into temp_undone_state
        INSERT INTO temp_undone_state_${options.tables.opLog}
        SELECT n.id,
               COALESCE(
                   (SELECT old_parent_id
                    FROM ${options.tables.opLog}
                    WHERE node_id = n.id
                      AND timestamp >= NEW.timestamp
                    ORDER BY timestamp DESC, seq DESC
                    LIMIT 1),
                   n.parent_id
               ) AS parent_id
        FROM ${options.tables.nodes} n;
        
        -- Step 2: Insert into temp_final_state
        INSERT INTO temp_final_state_${options.tables.opLog}
        SELECT t.id,
               COALESCE(
                   (SELECT new_parent_id
                    FROM ${options.tables.opLog}
                    WHERE node_id = t.id
                      AND timestamp >= NEW.timestamp
                    ORDER BY timestamp ASC, seq ASC
                    LIMIT 1),
                   t.parent_id
               ) AS new_parent_id
        FROM temp_undone_state_${options.tables.opLog} t;
        
        -- Step 3: Update nodes table
        UPDATE ${options.tables.nodes}
        SET parent_id = (
            SELECT new_parent_id
            FROM temp_final_state_${options.tables.opLog}
            WHERE temp_final_state_${options.tables.opLog}.id = ${options.tables.nodes}.id
        )
        WHERE id IN (
            SELECT id 
            FROM temp_final_state_${options.tables.opLog}
            WHERE temp_final_state_${options.tables.opLog}.new_parent_id IS NOT ${options.tables.nodes}.parent_id
        );
    END;
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

export const insertMoves = (
  moves: Move[],
  options: DatabaseOptions = defaultDatabaseOptions
) => {
  return sql(
    `INSERT INTO ${options.tables.opLog} (timestamp, node_id, old_parent_id, new_parent_id) VALUES (?, ?, ?, ?)`,
    moves.map((move) => [
      move.timestamp,
      move.node_id,
      move.old_parent_id,
      move.new_parent_id,
    ])
  )
}
