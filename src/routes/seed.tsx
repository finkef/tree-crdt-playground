import { Button } from "@/components/ui/button"
import { NumberInput } from "@/components/ui/number-input"
import { useSql } from "@/lib/sql/use-sql"
import { Play } from "lucide-react"
import { useState } from "react"

export default function Seed() {
  const [count, setCount] = useState(2000)
  const [isSeeding, setIsSeeding] = useState(false)
  const [time, setTime] = useState<number | null>(null)
  const sql = useSql()

  const seed = async () => {
    setIsSeeding(true)

    const { elapsed } = await sql.seed(count)

    setTime(elapsed)
    setIsSeeding(false)
  }

  return (
    <div className="p-4">
      <div className="space-y-2">
        <h2 className="text-2xl font-bold">Seed Database</h2>
        <p className="text-sm text-muted-foreground">
          This page is used to seed the database with data. It is useful for
          testing and development.
        </p>
      </div>

      <div className="mt-6 flex items-center gap-2">
        <NumberInput value={count} onChange={setCount} />
        <Button disabled={isSeeding} onClick={seed}>
          <Play className="mr-2 h-4 w-4" />
          Seed
        </Button>
      </div>

      {time && (
        <p className="mt-4 text-sm text-muted-foreground">
          Executed in {time.toFixed(3)} ms.
        </p>
      )}
    </div>
  )
}
