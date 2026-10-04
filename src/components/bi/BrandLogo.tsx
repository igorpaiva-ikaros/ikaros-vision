import { useId } from "react";

/** Original supplied logo, displayed in its artwork bounds on the dark brand surface. */
export function BrandLogo({ className }: { className?: string }) {
  const id = useId().replaceAll(":", "");
  return (
    <svg viewBox="163 387 1588 303" role="img" aria-label="IKAROS" className={className}>
      <defs>
        <clipPath id={`${id}-word`}><rect x="500" y="0" width="1420" height="1080" /></clipPath>
        <filter id={`${id}-ivory`}><feFlood floodColor="#f4f0e6" /><feComposite in2="SourceAlpha" operator="in" /></filter>
      </defs>
      <image href="/brand/ikaros-logo.png" width="1920" height="1080" />
      <g clipPath={`url(#${id}-word)`}>
        <image href="/brand/ikaros-logo.png" width="1920" height="1080" filter={`url(#${id}-ivory)`} />
      </g>
    </svg>
  );
}
