import { Move, Node } from "@/lib/sql/types"
import { cn } from "@/lib/utils"
import { Plus } from "lucide-react"
import { useMemo, useState } from "react"
import {
  Canvas,
  EdgeData,
  Node as ReaflowNode,
  Edge as ReaflowEdge,
  NodeData,
  hasLink,
  Remove,
} from "reaflow"
import { Button } from "./ui/button"

export function TreeVisualization({
  className,
  nodes,
  onMove,
  queryTime,
}: {
  className?: string
  nodes: Node[]
  onMove?: (move: Move) => void
  queryTime?: number
}) {
  const [selections, setSelections] = useState<string[]>([])

  const data = useMemo(() => {
    const edgeData: EdgeData[] = []
    for (const node of nodes) {
      if (node.parent_id) {
        edgeData.push({
          id: `${node.parent_id}-${node.id}`,
          from: node.parent_id,
          to: node.id,
        })
      }
    }

    const nodeMap = Object.fromEntries(nodes.map((node) => [node.id, node]))

    const isTombstone = (node: Node) => {
      let current = node
      while (current && current.parent_id) {
        current = nodeMap[current.parent_id]
      }
      return current?.id === "TOMBSTONE"
    }

    const nodeData: NodeData[] = nodes.map((node) => ({
      id: node.id,
      parent_id: node.parent_id,
      text: node.id,
      isTombstone: isTombstone(node),
    }))

    return {
      nodes: nodeData,
      edges: edgeData,
    }
  }, [nodes])

  return (
    <div className={cn("border border-border rounded-lg shadow-sm", className)}>
      <div className="aspect-square">
        <Canvas
          {...data}
          selections={selections}
          node={(node) => (
            <ReaflowNode
              dragType="node"
              removable={
                node.id !== "ROOT" && !(node.properties as any)?.isTombstone
              }
              remove={<Remove className="remove" />}
              onClick={(_event, node) => setSelections([node.id])}
              onRemove={(_event, node) => {
                onMove?.({
                  node_id: node.id,
                  timestamp: Date.now(),
                  old_parent_id: node.data?.parent_id ?? null,
                  new_parent_id: "TOMBSTONE",
                })
              }}
            />
          )}
          edge={<ReaflowEdge selectable={false} />}
          arrow={null}
          onCanvasClick={() => {
            setSelections([])
          }}
          onNodeLinkCheck={(_event, from: NodeData, to: NodeData) => {
            if (
              from.id === to.id ||
              from.id === "TOMBSTONE" ||
              from.id === "ROOT"
            ) {
              return false
            }
            if (hasLink(data.edges, from, to)) {
              return false
            }
            return true
          }}
          onNodeLink={async (
            _event,
            from: NodeData<{ parent_id: string }>,
            to
          ) => {
            onMove?.({
              node_id: from.id,
              timestamp: Date.now(),
              old_parent_id: from.data?.parent_id ?? null,
              new_parent_id: to.id,
            })
          }}
        />
      </div>

      <div className="p-2 border-t border-border flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {nodes.length} nodes, {data.edges.length} edges
          {typeof queryTime === "number" && <> — {queryTime}ms</>}
        </p>

        <Button
          variant="outline"
          size="icon"
          onClick={() =>
            onMove?.({
              node_id: generateRandomId(),
              timestamp: Date.now(),
              old_parent_id: null,
              new_parent_id: "ROOT",
            })
          }
        >
          <Plus className="w-4 h-4" />
        </Button>
      </div>
    </div>
  )
}

function generateRandomId() {
  return `${String.fromCharCode(
    65 + Math.floor(Math.random() * 26)
  )}${String.fromCharCode(
    65 + Math.floor(Math.random() * 26)
  )}${String.fromCharCode(65 + Math.floor(Math.random() * 26))}`
}
