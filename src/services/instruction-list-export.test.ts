import { describe, it, expect } from 'vitest';
import { exportInstructionList } from './instruction-list-export';
import type { LadderIR } from '../transformer/ladder-ir/ladder-ir-types';

type PartialRung = Partial<LadderIR['rungs'][number]> & {
  index: number;
  inputNetwork: LadderIR['rungs'][number]['inputNetwork'];
  output: LadderIR['rungs'][number]['output'];
};

function ir(rungs: PartialRung[]): LadderIR {
  return {
    rungs: rungs.map((r, i) => ({
      id: `r${i}`,
      sourceStatement: null,
      ...r,
    })),
    variables: [],
    functionBlocks: [],
  } as unknown as LadderIR;
}

describe('exportInstructionList', () => {
  it('emits XIC + OTE for simple NO → standard coil', () => {
    const result = exportInstructionList(
      ir([
        {
          index: 0,
          comment: 'Run',
          inputNetwork: { type: 'contact', variable: 'START', contactType: 'NO' },
          output: { type: 'coil', variable: 'MOTOR', coilType: 'standard' },
        },
      ]),
    );
    expect(result.text).toContain('RUNG 0');
    expect(result.text).toContain('XIC');
    expect(result.text).toContain('START');
    expect(result.text).toContain('OTE');
    expect(result.text).toContain('MOTOR');
    expect(result.rungCount).toBe(1);
  });

  it('emits XIO for NC contacts', () => {
    const result = exportInstructionList(
      ir([
        {
          index: 0,
          inputNetwork: { type: 'contact', variable: 'ESTOP', contactType: 'NC' },
          output: { type: 'coil', variable: 'RUN', coilType: 'standard' },
        },
      ]),
    );
    expect(result.text).toContain('XIO');
    expect(result.text).toContain('ESTOP');
  });

  it('wraps parallel branches in BST/NXB/BND', () => {
    const result = exportInstructionList(
      ir([
        {
          index: 0,
          inputNetwork: {
            type: 'parallel',
            branches: [
              { type: 'contact', variable: 'A', contactType: 'NO' },
              { type: 'contact', variable: 'B', contactType: 'NO' },
            ],
          },
          output: { type: 'coil', variable: 'Y', coilType: 'standard' },
        },
      ]),
    );
    expect(result.text).toMatch(/BST[\s\S]*XIC\s+A[\s\S]*NXB[\s\S]*XIC\s+B[\s\S]*BND/);
  });

  it('maps comparators to EQU/NEQ/GRT etc.', () => {
    const result = exportInstructionList(
      ir([
        {
          index: 0,
          inputNetwork: {
            type: 'comparator',
            operator: 'GT',
            leftOperand: 'TEMP',
            rightOperand: '100',
          },
          output: { type: 'coil', variable: 'ALARM', coilType: 'standard' },
        },
      ]),
    );
    expect(result.text).toContain('GRT');
    expect(result.text).toContain('TEMP');
    expect(result.text).toContain('100');
  });

  it('emits OTL/OTU for set/reset coils', () => {
    const result = exportInstructionList(
      ir([
        {
          index: 0,
          inputNetwork: { type: 'contact', variable: 'TRIG', contactType: 'NO' },
          output: { type: 'coil', variable: 'LATCH', coilType: 'set' },
        },
        {
          index: 1,
          inputNetwork: { type: 'contact', variable: 'CLEAR', contactType: 'NO' },
          output: { type: 'coil', variable: 'LATCH', coilType: 'reset' },
        },
      ]),
    );
    expect(result.text).toContain('OTL');
    expect(result.text).toContain('OTU');
  });

  it('includes rung comment when option set', () => {
    const result = exportInstructionList(
      ir([
        {
          index: 0,
          comment: 'Motor seal-in',
          inputNetwork: { type: 'true' },
          output: { type: 'coil', variable: 'X', coilType: 'standard' },
        },
      ]),
      { includeRungComments: true },
    );
    expect(result.text).toContain('(* Motor seal-in *)');
  });

  it('emits TON with instance + preset', () => {
    const result = exportInstructionList(
      ir([
        {
          index: 0,
          inputNetwork: { type: 'contact', variable: 'GO', contactType: 'NO' },
          output: {
            type: 'timer',
            timerType: 'TON',
            instanceName: 'T1',
            presetTime: 'T#5s',
            inputNetwork: { type: 'true' },
          },
        },
      ]),
    );
    expect(result.text).toContain('TON');
    expect(result.text).toContain('T1');
    expect(result.text).toContain('T#5s');
  });
});
