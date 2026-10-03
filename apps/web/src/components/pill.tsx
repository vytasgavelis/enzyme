import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";
import type * as React from "react";

/**
 * Small coloured label. Colour carries meaning (evidence tier, red flags, new), which the
 * neutral shadcn Badge can't express. Tones map to Tailwind palettes; `kind` sets emphasis.
 */
const pillVariants = cva(
  "inline-flex h-5 shrink-0 items-center gap-1 whitespace-nowrap rounded px-1.5 font-medium text-xs [&_svg]:size-3",
  {
    variants: {
      tone: {
        green: "",
        teal: "",
        blue: "",
        gray: "",
        orange: "",
        amber: "",
        red: "",
      },
      kind: {
        soft: "",
        solid: "",
        surface: "ring-1 ring-inset",
        outline: "ring-1 ring-inset",
      },
    },
    compoundVariants: [
      { tone: "green", kind: "soft", className: "bg-green-100 text-green-800" },
      { tone: "green", kind: "solid", className: "bg-green-600 text-white" },
      { tone: "green", kind: "surface", className: "bg-green-50 text-green-800 ring-green-300" },
      { tone: "green", kind: "outline", className: "text-green-700 ring-green-400" },
      { tone: "teal", kind: "soft", className: "bg-teal-100 text-teal-800" },
      { tone: "teal", kind: "solid", className: "bg-teal-600 text-white" },
      { tone: "teal", kind: "surface", className: "bg-teal-50 text-teal-800 ring-teal-300" },
      { tone: "teal", kind: "outline", className: "text-teal-700 ring-teal-400" },
      { tone: "blue", kind: "soft", className: "bg-blue-100 text-blue-800" },
      { tone: "blue", kind: "solid", className: "bg-blue-600 text-white" },
      { tone: "blue", kind: "surface", className: "bg-blue-50 text-blue-800 ring-blue-300" },
      { tone: "blue", kind: "outline", className: "text-blue-700 ring-blue-400" },
      { tone: "gray", kind: "soft", className: "bg-stone-100 text-stone-700" },
      { tone: "gray", kind: "solid", className: "bg-stone-600 text-white" },
      { tone: "gray", kind: "surface", className: "bg-stone-50 text-stone-700 ring-stone-300" },
      { tone: "gray", kind: "outline", className: "text-stone-600 ring-stone-300" },
      { tone: "orange", kind: "soft", className: "bg-orange-100 text-orange-800" },
      { tone: "orange", kind: "solid", className: "bg-orange-600 text-white" },
      {
        tone: "orange",
        kind: "surface",
        className: "bg-orange-50 text-orange-800 ring-orange-300",
      },
      { tone: "orange", kind: "outline", className: "text-orange-700 ring-orange-400" },
      { tone: "amber", kind: "soft", className: "bg-amber-100 text-amber-800" },
      { tone: "amber", kind: "solid", className: "bg-amber-500 text-white" },
      { tone: "amber", kind: "surface", className: "bg-amber-50 text-amber-800 ring-amber-300" },
      { tone: "amber", kind: "outline", className: "text-amber-700 ring-amber-400" },
      { tone: "red", kind: "soft", className: "bg-red-100 text-red-800" },
      { tone: "red", kind: "solid", className: "bg-red-600 text-white" },
      { tone: "red", kind: "surface", className: "bg-red-50 text-red-800 ring-red-300" },
      { tone: "red", kind: "outline", className: "text-red-700 ring-red-400" },
    ],
    defaultVariants: { tone: "gray", kind: "soft" },
  },
);

export type PillTone = NonNullable<VariantProps<typeof pillVariants>["tone"]>;

export function Pill({
  tone,
  kind,
  className,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof pillVariants>) {
  return <span className={cn(pillVariants({ tone, kind }), className)} {...props} />;
}
