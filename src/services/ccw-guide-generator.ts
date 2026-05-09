// src/services/ccw-guide-generator.ts
import type {
  LadderIR,
  LadderRungIR,
  ContactNetwork,
  RungOutput,
} from '../transformer/ladder-ir/ladder-ir-types';

export interface CcwStep {
  action: string;
}

export interface CcwRungGuide {
  rungIndex: number;
  comment?: string;
  steps: CcwStep[];
}

const CONTACT_LABELS: Record<string, string> = {
  NO: 'Direct Contact (XIC)',
  NC: 'Reverse Contact (XIO)',
  P: 'Positive Edge Contact',
  N: 'Negative Edge Contact',
};

const OP_LABELS: Record<string, string> = {
  EQ: 'EQU',
  NE: 'NEQ',
  GT: 'GRT',
  GE: 'GEQ',
  LT: 'LES',
  LE: 'LEQ',
};

const COIL_LABELS: Record<string, string> = {
  standard: 'Direct Coil (OTE)',
  set: 'Set Coil (OTL)',
  reset: 'Reset Coil (OTU)',
};

function walkNetwork(net: ContactNetwork, steps: CcwStep[]): void {
  switch (net.type) {
    case 'series':
      net.elements.forEach((e) => walkNetwork(e, steps));
      break;
    case 'parallel':
      steps.push({ action: '↳ Open parallel branch (OR)' });
      net.branches.forEach((b, i) => {
        if (i > 0) steps.push({ action: '  | (next branch)' });
        walkNetwork(b, steps);
      });
      steps.push({ action: '↳ Close parallel branch' });
      break;
    case 'contact':
      steps.push({
        action: `Add ${CONTACT_LABELS[net.contactType] ?? net.contactType} → bind to: ${net.variable}`,
      });
      break;
    case 'comparator':
      steps.push({
        action: `Add ${OP_LABELS[net.operator] ?? net.operator} Instruction → Left: ${net.leftOperand}, Right: ${net.rightOperand}`,
      });
      break;
    case 'true':
      steps.push({
        action: '(No contact needed — leave rung condition empty in CCW for unconditional execution)',
      });
      break;
  }
}

function walkOutput(output: RungOutput, steps: CcwStep[]): void {
  switch (output.type) {
    case 'coil':
      steps.push({
        action: `Add ${COIL_LABELS[output.coilType] ?? output.coilType} → bind to: ${output.variable}`,
      });
      break;
    case 'timer':
      steps.push({
        action: `Add ${output.timerType} Function Block → instance name: ${output.instanceName}`,
      });
      steps.push({ action: `  Set PT = ${output.presetTime}` });
      steps.push({
        action: `  Wire rung condition to IN pin (not EN — Micro800 TON has a distinct IN input)`,
      });
      break;
    case 'counter':
      steps.push({
        action: `Add ${output.counterType} Function Block → instance name: ${output.instanceName}, PV = ${output.presetValue}`,
      });
      break;
    case 'multi':
      output.outputs.forEach((o) => walkOutput(o, steps));
      break;
  }
}

export function generateCcwGuide(ir: LadderIR): CcwRungGuide[] {
  return ir.rungs.map((rung: LadderRungIR) => {
    const steps: CcwStep[] = [];
    walkNetwork(rung.inputNetwork, steps);
    walkOutput(rung.output, steps);
    return { rungIndex: rung.index, comment: rung.comment, steps };
  });
}
