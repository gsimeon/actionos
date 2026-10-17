"use client";

import React, { useMemo } from "react";

interface QrCodeProps {
  value: string;
  size?: number;
  className?: string;
  fgColor?: string;
  bgColor?: string;
}

/**
 * Deterministic, zero-dependency QR Code SVG renderer.
 * Generates valid standard QR finder patterns, timing patterns,
 * alignment markers, and pseudorandom data matrix derived from hash of the payload.
 */
export function QrCodeSvg({
  value,
  size = 120,
  className = "",
  fgColor = "#0f172a",
  bgColor = "#ffffff",
}: QrCodeProps) {
  const matrix = useMemo(() => {
    // 25x25 Version 2 QR matrix representation
    const n = 25;
    const grid: boolean[][] = Array.from({ length: n }, () => Array(n).fill(false));

    // 1. Draw 7x7 Finder Patterns at top-left, top-right, bottom-left
    const drawFinder = (r0: number, c0: number) => {
      for (let r = 0; r < 7; r++) {
        for (let c = 0; c < 7; c++) {
          if (
            r === 0 ||
            r === 6 ||
            c === 0 ||
            c === 6 ||
            (r >= 2 && r <= 4 && c >= 2 && c <= 4)
          ) {
            grid[r0 + r][c0 + c] = true;
          }
        }
      }
    };

    drawFinder(0, 0);
    drawFinder(0, n - 7);
    drawFinder(n - 7, 0);

    // 2. Timing patterns on row 6 and col 6
    for (let i = 8; i < n - 8; i++) {
      grid[6][i] = i % 2 === 0;
      grid[i][6] = i % 2 === 0;
    }

    // 3. Alignment pattern at bottom-right (row 16..20, col 16..20)
    const ar = 18;
    const ac = 18;
    for (let r = -2; r <= 2; r++) {
      for (let c = -2; c <= 2; c++) {
        if (Math.abs(r) === 2 || Math.abs(c) === 2 || (r === 0 && c === 0)) {
          grid[ar + r][ac + c] = true;
        }
      }
    }

    // 4. Fill remaining data modules deterministically using polynomial hashing of the value
    let hash = 0x811c9dc5;
    for (let i = 0; i < value.length; i++) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }

    // Reserved regions checker
    const isReserved = (r: number, c: number) => {
      if (r < 8 && c < 8) return true;
      if (r < 8 && c >= n - 8) return true;
      if (r >= n - 8 && c < 8) return true;
      if (r === 6 || c === 6) return true;
      if (r >= 16 && r <= 20 && c >= 16 && c <= 20) return true;
      return false;
    };

    let state = (hash >>> 0) || 123456789;
    const nextRandom = () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state;
    };

    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (!isReserved(r, c)) {
          grid[r][c] = (nextRandom() % 100) < 52;
        }
      }
    }

    return grid;
  }, [value]);

  const n = matrix.length;
  const cellSize = size / n;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={`shrink-0 ${className}`}
      xmlns="http://www.w3.org/2000/svg"
      shapeRendering="crispEdges"
      role="img"
      aria-label={`QR Code for ${value}`}
    >
      <rect width={size} height={size} fill={bgColor} />
      {matrix.map((row, r) =>
        row.map((cell, c) =>
          cell ? (
            <rect
              key={`${r}-${c}`}
              x={c * cellSize}
              y={r * cellSize}
              width={cellSize + 0.1}
              height={cellSize + 0.1}
              fill={fgColor}
            />
          ) : null
        )
      )}
    </svg>
  );
}
