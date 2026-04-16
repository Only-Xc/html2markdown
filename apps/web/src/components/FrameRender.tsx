"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface FrameRenderProps extends React.IframeHTMLAttributes<HTMLIFrameElement> {}

const FrameRender = React.forwardRef<HTMLIFrameElement, FrameRenderProps>(function FrameRender(
  { className, width = "100%", height = "100%", ...props },
  ref,
) {
  return <iframe {...props} ref={ref} width={width} height={height} className={cn("border-0", className)} />;
});

export default FrameRender;
