/**
 * Adapted from Aceternity UI FloatingDock.
 * One layout for all widths; icons magnify (transform only) on fine-pointer
 * hover devices when reduced motion is not requested.
 */
import { cn } from "@/lib/utils";
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "motion/react";
import type { MotionValue } from "motion/react";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

export interface DockItem {
  title: string;
  icon: ReactNode;
  href?: string;
  onClick?: () => void;
  current?: boolean;
}

function useFineHover(): boolean {
  const query = "(hover: hover) and (pointer: fine)";
  const [match, setMatch] = useState(
    () => typeof window !== "undefined" && window.matchMedia(query).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatch(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return match;
}

export function FloatingDock({
  items,
  className,
  ariaLabel,
}: {
  items: DockItem[];
  className?: string;
  ariaLabel: string;
}) {
  const mouseX = useMotionValue(Infinity);
  const fineHover = useFineHover();
  const reduced = useReducedMotion();
  const magnify = fineHover && !reduced;

  return (
    <nav aria-label={ariaLabel} className={className}>
      <ul
        onPointerMove={(e) => {
          if (magnify && e.pointerType === "mouse") mouseX.set(e.clientX);
        }}
        onPointerLeave={() => mouseX.set(Infinity)}
        className="flex items-end gap-1 rounded-2xl border border-line bg-panel/90 px-2 py-1.5 backdrop-blur"
      >
        {items.map((item) => (
          <li key={item.title}>
            <DockEntry item={item} mouseX={mouseX} magnify={magnify} />
          </li>
        ))}
      </ul>
    </nav>
  );
}

function DockEntry({
  item,
  mouseX,
  magnify,
}: {
  item: DockItem;
  mouseX: MotionValue<number>;
  magnify: boolean;
}) {
  const ref = useRef<HTMLSpanElement>(null);

  const distance = useTransform(mouseX, (val) => {
    const b = ref.current?.getBoundingClientRect() ?? { x: 0, width: 0 };
    return val - b.x - b.width / 2;
  });
  const scaleTransform = useTransform(distance, [-120, 0, 120], [1, 1.25, 1]);
  const scale = useSpring(scaleTransform, {
    mass: 0.1,
    stiffness: 150,
    damping: 12,
  });

  const classes = cn(
    "flex min-h-11 min-w-11 flex-col items-center justify-center gap-0.5 rounded-xl px-3 py-1 text-xs transition-colors",
    item.current
      ? "bg-accent/15 text-accent"
      : "text-dim hover:text-ink",
  );

  const content = (
    <>
      <motion.span
        ref={ref}
        aria-hidden="true"
        style={magnify ? { scale } : undefined}
        className="flex h-5 w-5 origin-bottom items-center justify-center [&>svg]:h-5 [&>svg]:w-5"
      >
        {item.icon}
      </motion.span>
      <span className="leading-none">{item.title}</span>
    </>
  );

  if (item.href !== undefined) {
    return (
      <Link
        to={item.href}
        aria-current={item.current ? "page" : undefined}
        className={classes}
      >
        {content}
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={item.onClick}
      aria-current={item.current ? "page" : undefined}
      className={classes}
    >
      {content}
    </button>
  );
}
