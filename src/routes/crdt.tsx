import { OpLog } from "@/components/op-log"
import { TreeVisualization } from "@/components/tree-visualization"
import { useOpLog } from "@/lib/sql/use-op-log"
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

  const [leftConnected, setLeftConnected] = useState(true)
  const [rightConnected, setRightConnected] = useState(true)

  const leftTree = useTree(LEFT_DB_OPTIONS)
  const rightTree = useTree(RIGHT_DB_OPTIONS)

  const leftOpLog = useOpLog(LEFT_DB_OPTIONS)
  const rightOpLog = useOpLog(RIGHT_DB_OPTIONS)

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
      <div className="flex flex-col gap-4">
        <TreeVisualization
          source="left"
          connected={leftConnected}
          onConnectedChange={async (connected) => {
            setLeftConnected(connected)

            if (!connected) return

            const pendingMoves = leftOpLog.moves.filter(
              (move) =>
                move.source &&
                ["left", "reconcile"].includes(move.source) &&
                !move.synced_at
            )

            const now = Date.now()
            const { restoreMoves } = await right.insertMoves(
              pendingMoves.map((move) => ({ ...move, synced_at: now })),
              true
            )

            if (rightConnected) {
              // Add reconciliation moves to the left
              await left.insertMoves(
                restoreMoves.map((m) => ({ ...m, synced_at: now })),
                true
              )
              await right.markMovesSynced(restoreMoves, now)
            }

            await left.markMovesSynced(pendingMoves, now)
          }}
          nodes={leftTree.nodes}
          onMove={async (move) => {
            const augmentedMove = {
              ...move,
              source: "left",
              synced_at: leftConnected ? Date.now() : undefined,
            }

            await left.insertMoves([augmentedMove])

            if (leftConnected) {
              const { restoreMoves } = await right.insertMoves(
                [augmentedMove],
                true
              )
              // Add reconciliation moves to the right
              await left.insertMoves(
                restoreMoves.map((m) => ({ ...m, synced_at: Date.now() })),
                true
              )
            }
          }}
          queryTime={leftTree.elapsed}
        />
        <OpLog moves={leftOpLog.moves} />
      </div>

      <div className="flex flex-col gap-4">
        <TreeVisualization
          source="right"
          connected={rightConnected}
          onConnectedChange={async (connected) => {
            setRightConnected(connected)

            if (!connected) return

            const pendingMoves = rightOpLog.moves.filter(
              (move) =>
                move.source &&
                ["right", "reconcile"].includes(move.source) &&
                !move.synced_at
            )

            const now = Date.now()
            const { restoreMoves } = await left.insertMoves(
              pendingMoves.map((move) => ({ ...move, synced_at: now })),
              true
            )

            if (leftConnected) {
              // Add reconciliation moves to the right
              await right.insertMoves(
                restoreMoves.map((m) => ({ ...m, synced_at: now }))
              )
              await left.markMovesSynced(restoreMoves, now)
            }

            await right.markMovesSynced(pendingMoves, now)
          }}
          nodes={rightTree.nodes}
          onMove={async (move) => {
            const augmentedMove = {
              ...move,
              source: "right",
              synced_at: rightConnected ? Date.now() : undefined,
            }

            await right.insertMoves([augmentedMove])

            if (rightConnected) {
              const { restoreMoves } = await left.insertMoves(
                [augmentedMove],
                true
              )

              // Add reconciliation moves to the right
              await right.insertMoves(
                restoreMoves.map((m) => ({ ...m, synced_at: Date.now() })),
                true
              )
            }
          }}
          queryTime={rightTree.elapsed}
        />
        <OpLog moves={rightOpLog.moves} />
      </div>
    </div>
  )
}
