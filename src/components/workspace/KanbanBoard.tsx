import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

/** An always-visible top scrollbar, also synchronized with touch and trackpad. */
export function KanbanBoard({ label, children }: { label: string; children: ReactNode }) {
  const viewport = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: 0, max: 0 });
  function measure() {
    const board = viewport.current;
    if (!board) return;
    const left = board.scrollLeft;
    const max = Math.max(0, board.scrollWidth - board.clientWidth);
    setPosition((old) => (old.left === left && old.max === max ? old : { left, max }));
  }
  useEffect(() => {
    measure();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    observer?.observe(viewport.current!);
    observer?.observe(content.current!);
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);
  function scrollTo(left: number) {
    if (!viewport.current) return;
    viewport.current.scrollLeft = left;
    measure();
  }
  function move(direction: number) {
    const board = viewport.current;
    if (board) scrollTo(board.scrollLeft + direction * Math.max(268, board.clientWidth * 0.75));
  }
  return (
    <div className="min-w-0" data-kanban-board>
      <div
        className="sticky top-0 z-20 mb-3 rounded-lg border bg-background/95 px-3 py-2 shadow-sm backdrop-blur"
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
              disabled={position.left <= 1}
              onClick={() => move(-1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              aria-label="Próximas etapas"
              disabled={position.left >= position.max - 1}
              onClick={() => move(1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <input
          type="range"
          min={0}
          max={position.max}
          step={1}
          value={Math.min(position.left, position.max)}
          disabled={position.max === 0}
          aria-label="Rolagem horizontal das etapas"
          aria-valuetext={
            position.max
              ? `${Math.round((position.left / position.max) * 100)}% do quadro`
              : "Todas as etapas visíveis"
          }
          className="kanban-scrollbar block h-5 w-full cursor-ew-resize"
          onChange={(e) => scrollTo(Number(e.target.value))}
        />
      </div>
      <div
        ref={viewport}
        role="region"
        tabIndex={0}
        aria-label={label}
        className="kanban-viewport overflow-x-auto pb-5"
        onScroll={measure}
      >
        <div ref={content} className="flex w-max min-w-full gap-3 items-stretch">
          {children}
        </div>
      </div>
    </div>
  );
}
