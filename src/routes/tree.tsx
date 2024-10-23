import { Canvas, EdgeData, NodeData } from "reaflow"
import { useEffect, useState } from "react"
import { useSql } from "@/lib/sql/use-sql"

export default function Tree() {
  const sql = useSql()

  const [data, setData] = useState<{
    nodes: NodeData[]
    edges: EdgeData[]
  }>({
    nodes: [],
    edges: [],
  })

  useEffect(() => {
    const fetchTree = async () => {
      const result = await sql.tree()

      const nodes = result.nodes.map((node) => ({
        id: node.id,
        // TODO: Use content
        text: node.id,
      }))

      const edges = []
      for (const node of result.nodes) {
        if (node.parent_id) {
          edges.push({
            id: `${node.parent_id}-${node.id}`,
            from: node.parent_id,
            to: node.id,
          })
        }
      }

      setData({
        nodes,
        edges,
      })
    }

    fetchTree()
  }, [])

  console.log(data)

  return (
    <div className="p-4">
      <div className="absolute inset-0 top-14">
        <Canvas nodes={data.nodes} edges={data.edges} />
      </div>
    </div>
  )
}
