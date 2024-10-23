export type Statement = {
  sql: string
  bindings?: any[]
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

export const createTables = () => {
  return sql`
    CREATE TABLE IF NOT EXISTS nodes (
        id TEXT PRIMARY KEY,
        parent_id TEXT,
        FOREIGN KEY (parent_id) REFERENCES nodes(id)
    );

    CREATE TABLE IF NOT EXISTS payloads (
        node_id TEXT NOT NULL,
        content TEXT,
        timestamp INTEGER NOT NULL,
        FOREIGN KEY (node_id) REFERENCES nodes(id)
    );

    CREATE TABLE IF NOT EXISTS op_log (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL,
        node_id TEXT NOT NULL,
        old_parent_id TEXT,
        new_parent_id TEXT,
        FOREIGN KEY (node_id) REFERENCES nodes(id),
        FOREIGN KEY (old_parent_id) REFERENCES nodes(id),
        FOREIGN KEY (new_parent_id) REFERENCES nodes(id)
    );

    CREATE INDEX IF NOT EXISTS idx_nodes_parent_id ON nodes(parent_id);
    CREATE INDEX IF NOT EXISTS idx_op_log_timestamp ON op_log(timestamp);
    CREATE INDEX IF NOT EXISTS idx_payloads_node_id ON payloads(node_id);
  `
}

export const nodeCount = () => {
  return sql`SELECT COUNT(1) FROM nodes`
}

export const seed = (count: number) => {
  return sql`
    BEGIN;

    DELETE FROM nodes;

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
    INSERT INTO nodes (id, parent_id)
    SELECT id, parent_id FROM temp_nodes;

    -- Clean up the temporary table
    DROP TABLE temp_nodes;

    END;
  `
}

export const tree = () => {
  return sql`
    SELECT nodes.id, nodes.parent_id, payloads.content
    FROM nodes
    LEFT JOIN payloads ON nodes.id = payloads.node_id
  `
}
