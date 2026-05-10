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
import type { VariableInfo } from '../../transformer/ladder-ir/ladder-ir-types';

function scopeLabel(scope: string): string {
  switch (scope) {
    case 'VAR_INPUT':  return 'Input';
    case 'VAR_OUTPUT': return 'Output';
    case 'VAR_TEMP':   return 'Temp';
    case 'VAR_GLOBAL': return 'Global';
    default:           return 'Internal';
  }
}

function rungList(info: VariableInfo): string {
  const nums = [...new Set(info.usages.map((u) => u.rungIndex + 1))].sort((a, b) => a - b);
  return nums.join(', ');
}

function PrintVariableTable({ variables }: { variables: Map<string, VariableInfo> }) {
  const io: VariableInfo[] = [];
  const user: VariableInfo[] = [];

  for (const v of variables.values()) {
    if (v.name.startsWith('_IO_EM_')) {
      io.push(v);
    } else {
      user.push(v);
    }
  }

  io.sort((a, b) => a.name.localeCompare(b.name));
  user.sort((a, b) => a.name.localeCompare(b.name));

  const th: React.CSSProperties = { textAlign: 'left', borderBottom: '1pt solid #000', paddingBottom: '2pt', paddingRight: '12pt', whiteSpace: 'nowrap' };
  const td: React.CSSProperties = { paddingRight: '12pt', paddingTop: '2pt', verticalAlign: 'top', whiteSpace: 'nowrap' };
  const mono: React.CSSProperties = { fontFamily: "'Courier New', monospace" };

  return (
    <div className="print-variable-table">
      <h2>Variable Reference</h2>

      <p className="print-var-note">
        <strong>User variables</strong> — add each to the Controller Global Variable table in CCW
        (Controller Organizer → Micro820 → Global Variables → Add).
        <strong> Physical I/O</strong> (<code>_IO_EM_*</code>) is auto-declared from the I/O
        configuration — do <em>not</em> add these manually.
      </p>

      {user.length > 0 && (
        <>
          <p className="print-var-section-label">User Variables (declare in Global Variable table)</p>
          <table className="print-var-tbl">
            <thead>
              <tr>
                <th style={th}>Name</th>
                <th style={th}>Data Type</th>
                <th style={th}>Scope</th>
                <th style={th}>Used in Rungs</th>
              </tr>
            </thead>
            <tbody>
              {user.map((v) => (
                <tr key={v.name}>
                  <td style={{ ...td, ...mono }}>{v.name}</td>
                  <td style={{ ...td, ...mono }}>{v.dataType}</td>
                  <td style={td}>{scopeLabel(v.scope)}</td>
                  <td style={td}>{rungList(v)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {io.length > 0 && (
        <>
          <p className="print-var-section-label">Physical I/O (auto-declared — do not add manually)</p>
          <table className="print-var-tbl">
            <thead>
              <tr>
                <th style={th}>Name</th>
                <th style={th}>Data Type</th>
                <th style={th}>Used in Rungs</th>
              </tr>
            </thead>
            <tbody>
              {io.map((v) => (
                <tr key={v.name}>
                  <td style={{ ...td, ...mono }}>{v.name}</td>
                  <td style={{ ...td, ...mono }}>{v.dataType}</td>
                  <td style={td}>{rungList(v)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

export function PrintView() {
  const content = useEditorStore((s) => s.getActiveFile()?.content);

  const ir = useMemo(() => {
    if (!content) return null;
    const result = transformSTToLadder(content, { includeIntermediates: true });
    return result.intermediates?.ir ?? null;
  }, [content]);

  if (!ir) return (
    <div className="print-view">
      <p style={{ fontFamily: 'Arial', color: 'red', padding: '0.5in 0.75in' }}>
        Cannot export PDF: the active program has errors or is empty. Fix all errors before exporting.
      </p>
    </div>
  );

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

      <PrintVariableTable variables={ir.variables} />

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
