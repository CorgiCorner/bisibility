"use client";
import { cn } from "@/lib/ui/cn";
import * as SliderPrimitive from "@radix-ui/react-slider";
import type { CSSProperties } from "react";
export type SliderProps = {
  value: number | number[];
  onValueChange: (value: number | number[]) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  "aria-label"?: string;
  getAriaLabel?: (index: number) => string;
  getAriaValueText?: (value: number) => string;
  marks?: readonly { value: number }[];
  className?: string;
  style?: CSSProperties;
};
export function Slider({
  value,
  onValueChange,
  min = 0,
  max = 100,
  step = 1,
  disabled,
  getAriaLabel,
  getAriaValueText,
  marks,
  className,
  style,
  "aria-label": label,
}: SliderProps) {
  const values = Array.isArray(value) ? value : [value];
  return (
    <SliderPrimitive.Root
      value={values}
      onValueChange={(next) => onValueChange(Array.isArray(value) ? next : next[0])}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      style={style}
      className={cn(
        "relative flex h-7 w-full touch-none select-none items-center text-accent data-disabled:opacity-50",
        className,
      )}
    >
      <SliderPrimitive.Track
        data-slot="slider-track"
        className="relative h-1 w-full grow rounded-full bg-border-control"
      >
        <SliderPrimitive.Range
          data-slot="slider-range"
          className="absolute h-full rounded-full bg-current"
        />
        {marks?.map((mark) => (
          <span
            data-slot="slider-mark"
            data-active={mark.value <= Math.max(...values)}
            aria-hidden
            key={mark.value}
            className="absolute top-1/2 h-2 w-px -translate-y-1/2 bg-border-control"
            style={{ left: `${(100 * (mark.value - min)) / (max - min)}%` }}
          />
        ))}
      </SliderPrimitive.Track>
      {values.map((item, index) => (
        <SliderPrimitive.Thumb
          data-slot="slider-thumb"
          key={index}
          aria-label={getAriaLabel?.(index) ?? label}
          aria-valuetext={getAriaValueText?.(item)}
          className="block size-3.5 rounded-full border border-current bg-bg-elev focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        />
      ))}
    </SliderPrimitive.Root>
  );
}
