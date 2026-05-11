/**
 * AB Instruction List (IL) Exporter
 *
 * Walks the LadderIR and emits Allen-Bradley-style instruction list text —
 * one mnemonic per line, with RUNG headers and inline `(* comment *)`. The
 * format mirrors what RSLogix 5000 / CCW produce on copy-paste-as-text and is
 * designed to be ingested back into MIRA's KB as searchable chunks where each
 * line is independently citable (e.g. "rung 12 line 3 XIC E_STOP_NC").
 *
 * AB → IR mnemonic mapping:
 *   NO contact          → XIC <tag>
 *   NC contact          → XIO <tag>
 *   P  (rising)         → ONS <tag>            (one-shot)
 *   N  (falling)        → OSF <tag>
 *   standard coil       → OTE <tag>
 *   set coil            → OTL <tag>
 *   reset coil          → OTU <tag>
 *   comparator EQ/NE…   → EQU/NEQ/GRT/GEQ/LES/LEQ <left> <right>
 *   TON/TOF/TP          → TON/TOF/TP <instance> <preset>
 *   CTU/CTD/CTUD        → CTU/CTD/CTUD <instance> <preset>
 *   parallel branches   → BST / NXB / BND
 *
 * NOTE: this is a *text* IL, not a binary L5X. L5X export is tracked separately
 * in docs/evals/ladder-editor-benchmark.md "Recommended Next Wave".
 */

import type {
  LadderIR,
  LadderRungIR,
  ContactNetwork,
  RungOutput,
  ContactType,
  ComparatorOp,
  CoilOutput,
  TimerOutput,
  CounterOutput,
} from '../transformer/ladder-ir/ladder-ir-types';

// ============================================================================
// Mnemonic tables
// ============================================================================

const CONTACT_MNEMONIC: Record<ContactType, string> = {
  NO: 'XIC',
  NC: 'XIO',
  P: 'ONS',
  N: 'OSF',
};

const CMP_MNEMONIC: Record<ComparatorOp, string> = {
  EQ: 'EQU',
  NE: 'NEQ',
  GT: 'GRT',
  GE: 'GEQ',
  LT: 'LES',
  LE: 'LEQ',
};

const COIL_MNEMONIC: Record<CoilOutput['coilType'], string> = {
  standard: 'OTE',
  set: 'OTL',
  reset: 'OTU',
};

// ============================================================================
// Options
// ============================================================================

export interface InstructionListOptions {
  /** Include the `(* rung comment *)` line above each RUNG block. Default: true. */
  includeRungComments?: boolean;
  /** Pad mnemonics to this column. Default: 8 (matches AB convention). */
  mnemonicColumn?: number;
  /** Header at top of file. Default: project name + timestamp. */
  header?: string;
}

const DEFAULT_OPTS: Required<Omit<InstructionListOptions, 'header'>> = {
  includeRungComments: true,
  mnemonicColumn: 8,
};

// ============================================================================
// Network walker
// ============================================================================

function emitNetwork(net: ContactNetwork, out: string[], pad: (m: string) => string): void {
  switch (net.type) {
    case 'series':
      net.elements.forEach((e) => emitNetwork(e, out, pad));
      break;
    case 'parallel':
      out.push(pad('BST'));
      net.branches.forEach((branch, i) => {
        if (i > 0) out.push(pad('NXB'));
        emitNetwork(branch, out, pad);
      });
      out.push(pad('BND'));
      break;
    case 'contact':
      out.push(`${pad(CONTACT_MNEMONIC[net.contactType])}${net.variable}`);
      break;
    case 'comparator':
      out.push(`${pad(CMP_MNEMONIC[net.operator])}${net.leftOperand} ${net.rightOperand}`);
      break;
    case 'true':
      // No-op — AB IL has no XIC for unconditional, the rung just emits the output
      break;
    default: {
      const _exhaustive: never = net;
      void _exhaustive;
    }
  }
}

// ============================================================================
// Output walker
// ============================================================================

function emitOutput(output: RungOutput, out: string[], pad: (m: string) => string): void {
  switch (output.type) {
    case 'coil':
      out.push(`${pad(COIL_MNEMONIC[output.coilType])}${output.variable}`);
      break;
    case 'timer':
      emitTimer(output, out, pad);
      break;
    case 'counter':
      emitCounter(output, out, pad);
      break;
    case 'multi':
      // Each parallel output gets its own line; AB IL allows stacked outputs
      output.outputs.forEach((o) => emitOutput(o, out, pad));
      break;
    default: {
      const _exhaustive: never = output;
      void _exhaustive;
    }
  }
}

function emitTimer(t: TimerOutput, out: string[], pad: (m: string) => string): void {
  out.push(`${pad(t.timerType)}${t.instanceName} ${t.presetTime}`);
}

function emitCounter(c: CounterOutput, out: string[], pad: (m: string) => string): void {
  out.push(`${pad(c.counterType)}${c.instanceName} ${c.presetValue}`);
}

// ============================================================================
// Public API
// ============================================================================

export interface InstructionListResult {
  text: string;
  rungCount: number;
  lineCount: number;
}

export function exportInstructionList(
  ir: LadderIR,
  options: InstructionListOptions = {},
): InstructionListResult {
  const opts = { ...DEFAULT_OPTS, ...options };
  const pad = (m: string) => m.padEnd(opts.mnemonicColumn);

  const lines: string[] = [];

  if (options.header) {
    lines.push(`(* ${options.header} *)`);
    lines.push('');
  }

  ir.rungs.forEach((rung: LadderRungIR) => {
    if (opts.includeRungComments && rung.comment) {
      lines.push(`RUNG ${rung.index}  (* ${rung.comment} *)`);
    } else {
      lines.push(`RUNG ${rung.index}`);
    }
    emitNetwork(rung.inputNetwork, lines, pad);
    emitOutput(rung.output, lines, pad);
    lines.push('');
  });

  // Drop trailing empty line
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();

  return {
    text: lines.join('\n') + '\n',
    rungCount: ir.rungs.length,
    lineCount: lines.length,
  };
}

/**
 * Trigger a browser download of the IL as a `.il` file. Mirrors the pattern
 * used by other exports in the editor (file-service, ccw-guide-generator's
 * PDF output).
 */
export function downloadInstructionList(
  ir: LadderIR,
  programName: string,
  options?: InstructionListOptions,
): InstructionListResult {
  const result = exportInstructionList(ir, options);
  const blob = new Blob([result.text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${programName.replace(/[^a-z0-9_-]/gi, '_')}.il`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return result;
}
