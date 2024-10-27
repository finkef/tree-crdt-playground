export type Node = {
  id: string
  parent_id: string
  content?: string
}

export type Move = {
  timestamp: number
  node_id: string
  old_parent_id: string | null
  new_parent_id: string
}
