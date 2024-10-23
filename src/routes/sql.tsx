import { Button } from "@/components/ui/button"
import Editor, { OnMount } from "@monaco-editor/react"
import { type editor, KeyCode, KeyMod } from "monaco-editor"
import { Play, Trash } from "lucide-react"
import { useRef, useState, useEffect } from "react"
import { useWorker } from "@/lib/sql/worker-context"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export default function Sql() {
  const worker = useWorker()
  const editorRef =
    useRef() as React.MutableRefObject<editor.IStandaloneCodeEditor>

  const [isRunning, setIsRunning] = useState(false)
  const [hasSelection, setHasSelection] = useState(false)
  const [result, setResult] = useState<{
    elapsed: number
    results: { columns: string[]; rows: any[][] }[]
  } | null>(null)

  const handleRun = async () => {
    setIsRunning(true)
    setResult(null)

    const selection = editorRef.current.getSelection()!
    const queries = selection.isEmpty()
      ? editorRef.current.getValue()
      : editorRef.current.getModel()?.getValueInRange(selection) ?? ""

    const result = await worker.exec({ sql: queries })

    setResult(result)
    setIsRunning(false)
  }

  const handleClear = () => {
    editorRef.current.setValue("")
  }

  const onMount: OnMount = (editor) => {
    editorRef.current = editor

    editor.onDidChangeCursorSelection(({ selection }) => {
      setHasSelection(!selection.isEmpty())
    })

    // Add command for running SQL
    editor.addCommand(KeyMod.CtrlCmd | KeyCode.Enter, handleRun)
  }

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault()
        handleRun()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])

  return (
    <div className="p-4">
      <div className="rounded-lg border border-input bg-transparent shadow-sm overflow-hidden">
        <Editor
          className=""
          height="400px"
          defaultLanguage="sql"
          defaultValue="SELECT 1"
          options={{
            minimap: { enabled: false },
            padding: { top: 16, bottom: 16 },
          }}
          onMount={onMount}
        />

        <div className="flex p-2 items-center justify-between border-t border-border bg-card">
          <span className="ml-2 text-sm text-muted-foreground italic">
            {result && `Executed in ${result.elapsed.toFixed(3)} ms.`}
          </span>

          <div className="flex gap-2">
            <Button variant="outline" onClick={handleClear}>
              <Trash className="size-4" />
              Clear
            </Button>

            <Button variant="default" onClick={handleRun} disabled={isRunning}>
              <Play className="size-4" />
              {hasSelection ? "Run selection" : "Run"}
              <span className="ml-2 text-xs text-slate-400">⌘⏎</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="mt-4 flex flex-col gap-4">
        {result?.results.map(({ columns, rows }, i) => (
          <div className="border border-border rounded-lg shadow-sm" key={i}>
            <Table className="border-collapse">
              <TableHeader>
                <TableRow>
                  {columns.map((column) => (
                    <TableHead key={column}>{column}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, i) => (
                  <TableRow key={i}>
                    {row.map((cell, j) => (
                      <TableCell key={j}>{cell}</TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ))}
      </div>
    </div>
  )
}
