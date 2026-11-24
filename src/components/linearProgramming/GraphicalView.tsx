/**
 * Sheeta Operations Research
 * 2D Graphical Method Canvas / SVG Visualizer
 */

import React, { useMemo } from 'react';
import { LpProblem } from '../../types';
import { useI18n } from '../../i18n/i18nContext';
import { EPS } from '../../engines/matrix';

interface GraphicalViewProps {
  problem: LpProblem;
  optimalPoint?: number[];
  optimalValue?: number;
}

interface Point {
  x: number;
  y: number;
  z: number;
  isOptimal: boolean;
}

interface Line {
  name: string;
  a: number;
  b: number;
  c: number;
  op: string;
  color: string;
}

const LINE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4'];

export const GraphicalView: React.FC<GraphicalViewProps> = ({
  problem,
  optimalPoint,
  optimalValue,
}) => {
  const { t } = useI18n();

  const { cornerPoints, lines, maxX, maxY, feasiblePolygonSvg } = useMemo(() => {
    if (problem.variables.length !== 2) {
      return {
        cornerPoints: [] as Point[],
        lines: [] as Line[],
        maxX: 10,
        maxY: 10,
        feasiblePolygonSvg: '',
      };
    }

    const linesList: Line[] = [];

    // Collect all boundary lines: constraints + non-negativity
    problem.constraints.forEach((c, idx) => {
      linesList.push({
        name: c.name || `${t.lp.defaultConstraintPrefix} ${idx + 1}`,
        a: c.coeffs[0],
        b: c.coeffs[1],
        c: c.rhs,
        op: c.op,
        color: LINE_COLORS[idx % LINE_COLORS.length],
      });
    });

    const lb0 = Number.isFinite(problem.variables[0]?.lowerBound) ? problem.variables[0].lowerBound : 0;
    const ub0 = Number.isFinite(problem.variables[0]?.upperBound) ? problem.variables[0].upperBound : Infinity;
    const lb1 = Number.isFinite(problem.variables[1]?.lowerBound) ? problem.variables[1].lowerBound : 0;
    const ub1 = Number.isFinite(problem.variables[1]?.upperBound) ? problem.variables[1].upperBound : Infinity;

    if (ub0 < Infinity) {
      linesList.push({
        name: `${problem.variables[0].name} <= ${ub0}`,
        a: 1,
        b: 0,
        c: ub0,
        op: '<=',
        color: '#64748b',
      });
    }
    if (ub1 < Infinity) {
      linesList.push({
        name: `${problem.variables[1].name} <= ${ub1}`,
        a: 0,
        b: 1,
        c: ub1,
        op: '<=',
        color: '#64748b',
      });
    }

    const allBoundaryLines: { a: number; b: number; c: number }[] = [
      { a: 1, b: 0, c: 0 },
      { a: 0, b: 1, c: 0 },
      ...linesList.map((l) => ({ a: l.a, b: l.b, c: l.c })),
    ];

    const candidatePoints: { x: number; y: number }[] = [];
    for (let i = 0; i < allBoundaryLines.length; i++) {
      for (let j = i + 1; j < allBoundaryLines.length; j++) {
        const l1 = allBoundaryLines[i];
        const l2 = allBoundaryLines[j];
        const det = l1.a * l2.b - l2.a * l1.b;
        if (Math.abs(det) > EPS) {
          const px = (l1.c * l2.b - l2.c * l1.b) / det;
          const py = (l1.a * l2.c - l2.a * l1.c) / det;
          if (px >= -EPS && py >= -EPS) {
            candidatePoints.push({ x: Math.max(0, px), y: Math.max(0, py) });
          }
        }
      }
    }

    const feasiblePoints: Point[] = [];
    const c1 = problem.variables[0].objCoeff;
    const c2 = problem.variables[1].objCoeff;

    for (const pt of candidatePoints) {
      let isFeasible = true;

      if (
        pt.x < lb0 - EPS ||
        pt.x > ub0 + EPS ||
        pt.y < lb1 - EPS ||
        pt.y > ub1 + EPS
      ) {
        continue;
      }

      for (const c of problem.constraints) {
        const lhs = c.coeffs[0] * pt.x + c.coeffs[1] * pt.y;
        if (c.op === '<=' && lhs > c.rhs + 1e-4) {
          isFeasible = false;
          break;
        }
        if (c.op === '>=' && lhs < c.rhs - 1e-4) {
          isFeasible = false;
          break;
        }
        if (c.op === '=' && Math.abs(lhs - c.rhs) > 1e-4) {
          isFeasible = false;
          break;
        }
      }

      if (isFeasible) {
        const exists = feasiblePoints.some(
          (p) => Math.abs(p.x - pt.x) < 1e-3 && Math.abs(p.y - pt.y) < 1e-3
        );
        if (!exists) {
          const z = c1 * pt.x + c2 * pt.y;
          const isOptimal =
            optimalPoint !== undefined &&
            Math.abs(pt.x - optimalPoint[0]) < 1e-3 &&
            Math.abs(pt.y - optimalPoint[1]) < 1e-3;
          feasiblePoints.push({ x: pt.x, y: pt.y, z, isOptimal });
        }
      }
    }

    if (optimalPoint && optimalPoint.length === 2) {
      const exists = feasiblePoints.some(
        (p) => Math.abs(p.x - optimalPoint[0]) < 1e-3 && Math.abs(p.y - optimalPoint[1]) < 1e-3
      );
      if (!exists && optimalPoint[0] >= 0 && optimalPoint[1] >= 0) {
        const z = c1 * optimalPoint[0] + c2 * optimalPoint[1];
        feasiblePoints.push({
          x: optimalPoint[0],
          y: optimalPoint[1],
          z,
          isOptimal: true,
        });
      }
    }

    let maxXVal = 10;
    let maxYVal = 10;
    feasiblePoints.forEach((p) => {
      if (p.x > maxXVal) maxXVal = p.x;
      if (p.y > maxYVal) maxYVal = p.y;
    });

    linesList.forEach((l) => {
      if (Math.abs(l.a) > EPS && l.c / l.a > 0 && l.c / l.a < 500) {
        maxXVal = Math.max(maxXVal, l.c / l.a);
      }
      if (Math.abs(l.b) > EPS && l.c / l.b > 0 && l.c / l.b < 500) {
        maxYVal = Math.max(maxYVal, l.c / l.b);
      }
    });

    const scaleX = maxXVal * 1.25;
    const scaleY = maxYVal * 1.25;

    let polygonPath = '';
    if (feasiblePoints.length >= 3) {
      const cx = feasiblePoints.reduce((sum, p) => sum + p.x, 0) / feasiblePoints.length;
      const cy = feasiblePoints.reduce((sum, p) => sum + p.y, 0) / feasiblePoints.length;
      const sortedPoints = [...feasiblePoints].sort((p1, p2) => {
        const angle1 = Math.atan2(p1.y - cy, p1.x - cx);
        const angle2 = Math.atan2(p2.y - cy, p2.x - cx);
        return angle1 - angle2;
      });

      polygonPath = sortedPoints
        .map((p, idx) => {
          const svgX = 50 + (p.x / scaleX) * 400;
          const svgY = 450 - (p.y / scaleY) * 400;
          return `${idx === 0 ? 'M' : 'L'} ${svgX} ${svgY}`;
        })
        .join(' ') + ' Z';
    }

    return {
      cornerPoints: feasiblePoints,
      lines: linesList,
      maxX: scaleX,
      maxY: scaleY,
      feasiblePolygonSvg: polygonPath,
    };
  }, [problem, optimalPoint, t]);

  if (problem.variables.length !== 2) {
    return (
      <div className="p-6 text-center text-sm text-slate-500 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-800">
        {t.lp.noTwoVariablesGraph}
      </div>
    );
  }

  const toSvgX = (x: number) => 50 + (x / maxX) * 400;
  const toSvgY = (y: number) => 450 - (y / maxY) * 400;

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">{t.lp.graphTitle}</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            X₁: {problem.variables[0].name} vs X₂: {problem.variables[1].name}
          </p>
        </div>
        {optimalValue !== undefined && (
          <div className="flex items-center gap-2 text-xs">
            <span className="font-semibold text-slate-600 dark:text-slate-400">{t.lp.optimalValue}:</span>
            <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
              {optimalValue.toFixed(4)}
            </span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2 bg-slate-50 dark:bg-slate-950 rounded-xl p-4 border border-slate-200 dark:border-slate-800 overflow-hidden flex items-center justify-center">
          <svg viewBox="0 0 500 500" className="w-full max-w-[480px] h-auto select-none">
            {[0.25, 0.5, 0.75, 1.0].map((frac) => (
              <React.Fragment key={frac}>
                <line
                  x1={toSvgX(maxX * frac)}
                  y1={50}
                  x2={toSvgX(maxX * frac)}
                  y2={450}
                  stroke="#cbd5e1"
                  strokeDasharray="3 3"
                  className="dark:stroke-slate-800"
                />
                <line
                  x1={50}
                  y1={toSvgY(maxY * frac)}
                  x2={450}
                  y2={toSvgY(maxY * frac)}
                  stroke="#cbd5e1"
                  strokeDasharray="3 3"
                  className="dark:stroke-slate-800"
                />
                <text
                  x={toSvgX(maxX * frac)}
                  y={468}
                  fontSize="10"
                  textAnchor="middle"
                  fill="#94a3b8"
                >
                  {(maxX * frac).toFixed(0)}
                </text>
                <text
                  x={42}
                  y={toSvgY(maxY * frac) + 3}
                  fontSize="10"
                  textAnchor="end"
                  fill="#94a3b8"
                >
                  {(maxY * frac).toFixed(0)}
                </text>
              </React.Fragment>
            ))}

            {feasiblePolygonSvg && (
              <path
                d={feasiblePolygonSvg}
                fill="rgba(99, 102, 241, 0.25)"
                stroke="#6366f1"
                strokeWidth="2"
              />
            )}

            <line x1={50} y1={450} x2={465} y2={450} stroke="#475569" strokeWidth="2" />
            <line x1={50} y1={450} x2={50} y2={35} stroke="#475569" strokeWidth="2" />
            <text x={470} y={454} fontSize="11" fontWeight="bold" fill="#334155" className="dark:fill-slate-300">
              x₁
            </text>
            <text x={50} y={25} fontSize="11" fontWeight="bold" textAnchor="middle" fill="#334155" className="dark:fill-slate-300">
              x₂
            </text>

            {lines.map((l, idx) => {
              let p1x = 0;
              let p1y = 0;
              let p2x = 0;
              let p2y = 0;

              if (Math.abs(l.b) > EPS && Math.abs(l.a) > EPS) {
                p1x = 0;
                p1y = l.c / l.b;
                p2x = l.c / l.a;
                p2y = 0;
              } else if (Math.abs(l.b) <= EPS) {
                p1x = l.c / l.a;
                p1y = 0;
                p2x = l.c / l.a;
                p2y = maxY;
              } else {
                p1x = 0;
                p1y = l.c / l.b;
                p2x = maxX;
                p2y = l.c / l.b;
              }

              return (
                <line
                  key={idx}
                  x1={toSvgX(p1x)}
                  y1={toSvgY(p1y)}
                  x2={toSvgX(p2x)}
                  y2={toSvgY(p2y)}
                  stroke={l.color}
                  strokeWidth="2"
                  opacity="0.85"
                />
              );
            })}

            {cornerPoints.map((pt, idx) => {
              const sx = toSvgX(pt.x);
              const sy = toSvgY(pt.y);
              return (
                <g key={idx}>
                  {pt.isOptimal ? (
                    <>
                      <circle cx={sx} cy={sy} r="9" fill="rgba(16, 185, 129, 0.3)" />
                      <circle cx={sx} cy={sy} r="5" fill="#10b981" stroke="#ffffff" strokeWidth="2" />
                    </>
                  ) : (
                    <circle cx={sx} cy={sy} r="4" fill="#6366f1" stroke="#ffffff" strokeWidth="1.5" />
                  )}
                  <text
                    x={sx + 8}
                    y={sy - 8}
                    fontSize="10"
                    fontWeight="bold"
                    fill={pt.isOptimal ? '#059669' : '#475569'}
                    className="dark:fill-slate-300"
                  >
                    ({pt.x.toFixed(1)}, {pt.y.toFixed(1)})
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        <div className="space-y-4">
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
              {t.lp.constraintsHeader}
            </h4>
            <div className="space-y-2">
              {lines.map((l, idx) => (
                <div key={idx} className="flex items-center gap-2 text-xs">
                  <div className="w-3.5 h-1 rounded-full shrink-0" style={{ backgroundColor: l.color }} />
                  <span className="font-medium text-slate-700 dark:text-slate-300 truncate">
                    {l.name}: {l.a}x₁ + {l.b}x₂ {l.op} {l.c}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
              {t.lp.cornerPoints}
            </h4>
            <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 font-semibold">
                  <tr>
                    <th className="px-3 py-2 text-start">{t.lp.pointCol}</th>
                    <th className="px-3 py-2 text-end">{t.lp.zValueCol}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono">
                  {cornerPoints.map((pt, idx) => (
                    <tr
                      key={idx}
                      className={
                        pt.isOptimal
                          ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-bold'
                          : 'text-slate-700 dark:text-slate-300'
                      }
                    >
                      <td className="px-3 py-1.5 flex items-center gap-1.5">
                        {pt.isOptimal && <span className="text-emerald-500">★</span>}
                        <span>({pt.x.toFixed(2)}, {pt.y.toFixed(2)})</span>
                      </td>
                      <td className="px-3 py-1.5 text-end tabular-nums">
                        {pt.z.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
