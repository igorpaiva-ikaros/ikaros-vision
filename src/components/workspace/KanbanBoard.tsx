import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

/** One horizontal position shared by the top scrollbar, buttons and touch/trackpad. */
export function KanbanBoard({ label, children }: { label: string; children: ReactNode }) {
  const top = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [edges, setEdges] = useState({ start: true, end: true });
  function sync(source: HTMLDivElement) {
    const other = source === top.current ? viewport.current : top.current;
    if (other && Math.abs(other.scrollLeft - source.scrollLeft) > 1)
      other.scrollLeft = source.scrollLeft;
    const board = viewport.current;
    if (board) {
      const start = board.scrollLeft <= 1;
      const end = board.scrollLeft + board.clientWidth >= board.scrollWidth - 1;
      setEdges((old) => (old.start === start && old.end === end ? old : { start, end }));
    }
  }
  useEffect(() => {
    const board = viewport.current!;
    const measure = () => {
      setWidth(
        board.scrollWidth - board.clientWidth + (top.current?.clientWidth ?? board.clientWidth),
      );
      sync(board);
    };
    measure();
    // ResizeObserver also covers custom funnel changes and sidebar/viewport resizing.
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    observer?.observe(board);
    observer?.observe(content.current!);
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);
  function move(direction: number) {
    const board = viewport.current;
    if (!board) return;
    board.scrollLeft += direction * Math.max(268, board.clientWidth * 0.75);
    sync(board);
  }
  return (
    <div className="min-w-0" data-kanban-board>
      <div
        className="sticky top-0 z-20 mb-3 rounded-lg border bg-background/95 px-2 py-2 shadow-sm backdrop-blur"
        data-kanban-controls
      >
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">Navegar pelas etapas</span>
          <div className="flex gap-1">
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              aria-label="Etapas anteriores"
              disabled={edges.start}
              onClick={() => move(-1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              aria-label="Próximas etapas"
              disabled={edges.end}
              onClick={() => move(1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div
          ref={top}
          role="region"
          tabIndex={0}
          aria-label="Rolagem horizontal das etapas"
          className="kanban-scrollbar overflow-x-scroll overflow-y-hidden"
          onScroll={(e) => sync(e.currentTarget)}
        >
          <div style={{ width, height: 1 }} />
        </div>
      </div>
      <div
        ref={viewport}
        role="region"
        tabIndex={0}
        aria-label={label}
        className="kanban-viewport overflow-x-auto pb-5"
        onScroll={(e) => sync(e.currentTarget)}
      >
        <div ref={content} className="flex w-max min-w-full gap-3 items-stretch">
          {children}
        </div>
      </div>
    </div>
  );
}
