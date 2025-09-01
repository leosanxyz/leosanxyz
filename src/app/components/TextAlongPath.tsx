import React from 'react';

type PreserveAspectRatioAlign =
  | 'none'
  | 'xMinYMin'
  | 'xMidYMin'
  | 'xMaxYMin'
  | 'xMinYMid'
  | 'xMidYMid'
  | 'xMaxYMid'
  | 'xMinYMax'
  | 'xMidYMax'
  | 'xMaxYMax';

type PreserveAspectRatioMeetOrSlice = 'meet' | 'slice';

type PreserveAspectRatio =
  | PreserveAspectRatioAlign
  | `${Exclude<PreserveAspectRatioAlign, 'none'>} ${PreserveAspectRatioMeetOrSlice}`;

interface AnimatedPathTextProps {
  path: string;
  pathId?: string;
  pathClassName?: string;
  preserveAspectRatio?: PreserveAspectRatio;
  showPath?: boolean;
  width?: string | number;
  height?: string | number;
  viewBox?: string;
  svgClassName?: string;
  text: string;
  textClassName?: string;
  textStyle?: React.CSSProperties;
  textAnchor?: 'start' | 'middle' | 'end';
  duration?: number; // seconds
  repeatCount?: number | 'indefinite';
}

// Lightweight version (auto animation only) to avoid extra deps
const AnimatedPathText: React.FC<AnimatedPathTextProps> = ({
  path,
  pathId,
  pathClassName,
  preserveAspectRatio = 'xMidYMid meet',
  showPath = false,
  width = '100%',
  height = '100%',
  viewBox = '0 0 100 100',
  svgClassName,
  text,
  textClassName,
  textStyle,
  textAnchor = 'start',
  duration = 6,
  repeatCount = 'indefinite',
}) => {
  const id = pathId || `animated-path-${Math.random().toString(36).slice(2)}`;
  const dur = `${duration}s`;

  return (
    <svg
      className={svgClassName}
      xmlns="http://www.w3.org/2000/svg"
      width={width}
      height={height}
      viewBox={viewBox}
      preserveAspectRatio={preserveAspectRatio}
    >
      <path id={id} className={pathClassName} d={path} stroke={showPath ? 'currentColor' : 'none'} fill="none" />

      <text textAnchor={textAnchor} fill="currentColor">
        <textPath className={textClassName} href={`#${id}`} startOffset={"0%"} style={textStyle}>
          <animate attributeName="startOffset" from="0%" to="100%" begin="0s" dur={dur} repeatCount={repeatCount} />
          {text}
        </textPath>
      </text>

      <text textAnchor={textAnchor} fill="currentColor">
        <textPath className={textClassName} href={`#${id}`} startOffset={"-100%"} style={textStyle}>
          <animate attributeName="startOffset" from="-100%" to="0%" begin="0s" dur={dur} repeatCount={repeatCount} />
          {text}
        </textPath>
      </text>
    </svg>
  );
};

export default AnimatedPathText;

