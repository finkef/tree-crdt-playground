import { Move } from "@/lib/sql/types"
import { cn } from "@/lib/utils"
import { ArrowRight, CircleAlert, Plus, Trash2 } from "lucide-react"

export function OpLog({
  moves,
  className,
}: {
  moves: Move[]
  className?: string
}) {
  return (
    <div className={cn("border border-border rounded-lg shadow-sm", className)}>
      {moves.length === 0 && (
        <div className="p-2 text-sm text-muted-foreground text-center">
          No operations
        </div>
      )}

      {moves.map((move) => {
        const isCreation = move.old_parent_id === null
        const isDeletion = move.new_parent_id === "TOMBSTONE"

        return (
          <div
            className={cn(
              "border-b border-border last:border-b-0 p-2 text-sm font-mono flex items-center gap-2",
              move.source === "left" &&
                "bg-blue-50/50 bg-[repeating-linear-gradient(45deg,transparent,transparent_4px,rgba(59,130,246,0.05)_2px,rgba(59,130,246,0.05)_8px)]",
              move.source === "right" &&
                "bg-red-50/50 bg-[repeating-linear-gradient(45deg,transparent,transparent_4px,rgba(239,68,68,0.05)_2px,rgba(239,68,68,0.05)_8px)]"
            )}
            key={`${move.node_id}-${move.timestamp}`}
          >
            {isCreation && <Plus className="w-4 h-4 text-green-500" />}
            {isDeletion && <Trash2 className="w-4 h-4 text-red-500" />}
            {!isCreation && !isDeletion && (
              <ArrowRight className="w-4 h-4 text-blue-500" />
            )}
            <span className="font-semibold">{move.node_id}:</span>{" "}
            <span className="text-muted-foreground">
              {move.old_parent_id ?? "NULL"} → {move.new_parent_id ?? "NULL"}
            </span>
            {move.creates_cycle ? (
              <div className="ml-2 text-red-500 flex items-center gap-1">
                <CircleAlert className="w-4 h-4" /> Skipped due to cycle
              </div>
            ) : null}
            <div className="flex-1" />
            <span className="text-muted-foreground">
              {/* Assuming moves less than 5 seconds old are pending */}
              {move.synced_at ? (
                <span className="text-green-500">✓</span>
              ) : (
                <span className="text-yellow-500">●</span>
              )}
            </span>
          </div>
        )
      })}
    </div>
  )
}
