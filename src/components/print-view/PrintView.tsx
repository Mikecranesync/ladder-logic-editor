/**
 * PrintView
 *
 * Full-page print layout: header block + per-rung SVG railroad + CCW build guide.
 * Hidden on screen via CSS (display: none in @media screen).
 * Visible on print via CSS (display: block in @media print).
 *
 * Uses its own transform pass (useMemo) because MainLayout keeps the transform
 * result in local state — the editor store's lastTransformResult is not populated.
 */

import { useMemo } from 'react';
import { useEditorStore } from '../../store';
import { transformSTToLadder } from '../../transformer';
import { generateCcwGuide } from '../../services/ccw-guide-generator';
import { PrintRungSvg } from './PrintRungSvg';

export function PrintView() {
  const content = useEditorStore((s) => s.getActiveFile()?.content);

  const ir = useMemo(() => {
    if (!content) return null;
    const result = transformSTToLadder(content, { includeIntermediates: true });
    return result.intermediates?.ir ?? null;
  }, [content]);

  if (!ir) return null;

  const guide = generateCcwGuide(ir);

  return (
    <div className="print-view">
      <div className="print-header">
        <h1>Ladder Program: {ir.programName}</h1>
        <p className="print-meta">
          Generated {new Date().toLocaleDateString()} &middot; {ir.rungs.length} rungs &middot;
          Target: Allen-Bradley Micro820 2080-LC20-20QBB (CCW Ladder Editor)
        </p>
        <p className="print-instructions">
          Transcribe each rung into CCW&apos;s LD editor. Variables are already declared in the
          Controller Global Variable table &mdash; do <em>not</em> redeclare them.
        </p>
      </div>

      {guide.map((rungGuide, i) => {
        const rung = ir.rungs[i];
        return (
          <div key={rungGuide.rungIndex} className="print-rung">
            <h3>
              Rung {rungGuide.rungIndex + 1}
              {rungGuide.comment ? ` \u2014 ${rungGuide.comment}` : ''}
            </h3>
            <div className="print-rung-visual">
              <PrintRungSvg rung={rung} />
            </div>
            <div className="print-rung-guide">
              <strong>CCW Steps:</strong>
              <ol>
                {rungGuide.steps.map((step, si) => (
                  <li key={`${rungGuide.rungIndex}-${si}`}>{step.action}</li>
                ))}
              </ol>
            </div>
          </div>
        );
      })}
    </div>
  );
}
