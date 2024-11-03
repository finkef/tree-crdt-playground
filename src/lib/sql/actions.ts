import { nanoid } from "nanoid"
import { DatabaseOptions, type Statement } from "./statements"
import { Move } from "./types"

export const reset = () => ({
  type: "reset" as const,
  id: nanoid(),
})

export const exec = ({ sql, bindings }: Statement) => ({
  type: "exec" as const,
  id: nanoid(),
  sql,
  bindings,
})

export const insertMoves = (moves: Move[], options: DatabaseOptions) => ({
  type: "insertMoves" as const,
  id: nanoid(),
  moves,
  options,
})

export type Action =
  | ReturnType<typeof reset>
  | ReturnType<typeof exec>
  | ReturnType<typeof insertMoves>
