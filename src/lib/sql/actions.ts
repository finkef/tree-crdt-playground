import { nanoid } from "nanoid"
import { type Statement } from "./statements"

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

export type Action = ReturnType<typeof reset> | ReturnType<typeof exec>
