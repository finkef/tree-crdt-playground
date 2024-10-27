import { TreeVisualization } from "@/components/tree-visualization"
import { useSql } from "@/lib/sql/use-sql"
import { useTree } from "@/lib/sql/use-tree"
import { useEffect, useState } from "react"

const LEFT_DB_OPTIONS = {
  tables: {
    nodes: "left_nodes",
    payloads: "left_payloads",
    opLog: "left_op_log",
  },
}
const RIGHT_DB_OPTIONS = {
  tables: {
    nodes: "right_nodes",
    payloads: "right_payloads",
    opLog: "right_op_log",
  },
}

export default function Crdt() {
  const left = useSql(LEFT_DB_OPTIONS)
  const right = useSql(RIGHT_DB_OPTIONS)
  const [initialized, setInitialized] = useState(false)

  const leftTree = useTree(LEFT_DB_OPTIONS)
  const rightTree = useTree(RIGHT_DB_OPTIONS)

  useEffect(() => {
    const init = async () => {
      // Init
      await left.init()
      await right.init()

      // Clear
      await left.clear()
      await right.clear()

      setInitialized(true)
    }

    init()
  }, [])

  if (!initialized) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        Initializing...
      </div>
    )
  }

  return (
    <div className="p-4 grid grid-cols-2 gap-4">
      <TreeVisualization
        nodes={leftTree.nodes}
        onMove={(move) => left.insertMoves([move])}
        queryTime={leftTree.elapsed}
      />
      <TreeVisualization
        nodes={rightTree.nodes}
        onMove={(move) => right.insertMoves([move])}
        queryTime={rightTree.elapsed}
      />
    </div>
  )
}
