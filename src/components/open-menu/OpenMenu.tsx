/**
 * Open Menu Component
 *
 * Dropdown menu for opening files from examples or local files.
 */

import { useState, useRef, useEffect } from 'react';
import { useEditorStore, useProjectStore } from '../../store';
import { openSTFile } from '../../services/file-service';
import { downloadInstructionList } from '../../services/instruction-list-export';
import { ingestInstructionList, isBridgeEnabled } from '../../services/mira-bridge';
import trafficControllerST from '../../examples/traffic-controller.st?raw';
import dualPumpControllerST from '../../examples/dual-pump-controller.st?raw';
import './OpenMenu.css';

export function OpenMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const openFile = useEditorStore((state) => state.openFile);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close on escape
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen]);

  const handleLoadExample = (example: 'traffic' | 'dual-pump') => {
    if (example === 'traffic') {
      openFile('TrafficController.st', trafficControllerST);
    } else if (example === 'dual-pump') {
      openFile('DualPumpController.st', dualPumpControllerST);
    }

    setIsOpen(false);
  };

  const handleExportPdf = () => {
    window.print();
    setIsOpen(false);
  };

  const handleExportInstructionList = async () => {
    setIsOpen(false);
    const state = useProjectStore.getState();
    const result = state.lastTransformResult ?? state.transformCurrentProgram();
    const ir = result?.intermediates?.ir;
    const program = state.project?.programs.find((p) => p.id === state.currentProgramId);
    if (!ir || !program) {
      alert('No program to export. Open or write some ST code first.');
      return;
    }
    const exportResult = downloadInstructionList(ir, program.name, {
      header: `${program.name} — exported from ladder-logic-editor ${new Date().toISOString()}`,
    });

    // If MIRA bridge is wired up, offer to push the IL to the KB too.
    if (isBridgeEnabled()) {
      const assetTag = window.prompt(
        'Push this instruction list to MIRA KB? Enter asset tag (or cancel to skip):',
        program.name,
      );
      if (assetTag) {
        const res = await ingestInstructionList({
          asset_tag: assetTag,
          program_name: program.name,
          content: exportResult.text,
          metadata: {
            rung_count: exportResult.rungCount,
            line_count: exportResult.lineCount,
          },
        });
        if (res.ok) {
          alert(`Ingested to MIRA KB (id: ${res.data.id}).`);
        } else if (!res.disabled) {
          alert(`MIRA ingest failed: ${res.error}`);
        }
      }
    }
  };

  const handleLoadFromMira = async () => {
    setIsOpen(false);
    const assetTag = window.prompt('Load manifest from MIRA for asset tag:');
    if (!assetTag) return;
    const { fetchManifest } = await import('../../services/mira-bridge');
    const res = await fetchManifest(assetTag);
    if (!res.ok) {
      if (res.disabled) {
        alert(
          'MIRA bridge is not configured. Set VITE_MIRA_BASE_URL or window.MIRA_BRIDGE_URL.',
        );
      } else {
        alert(`Failed to load manifest: ${res.error}`);
      }
      return;
    }
    useProjectStore.getState().loadManifest({
      variables: res.data.variables.map((v) => ({
        name: v.name,
        alias: v.alias ?? null,
        modbusAddress: v.modbusAddress ?? null,
        direction: v.direction,
        address: v.address ?? null,
      })),
    });
    alert(`Loaded ${res.data.variables.length} variables from MIRA for ${assetTag}.`);
  };

  const handleOpenLocalFile = async () => {
    try {
      const { programName, stCode } = await openSTFile();
      openFile(programName, stCode);
    } catch (error) {
      if ((error as Error).message !== 'File selection cancelled') {
        console.error('Error opening ST file:', error);
        alert(`Failed to open ST file: ${(error as Error).message}`);
      }
    }

    setIsOpen(false);
  };

  return (
    <div className="open-menu" ref={dropdownRef}>
      <button
        className="toolbar-btn"
        title="Open File"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="toolbar-icon">📂</span>
        <span className="toolbar-label">Open</span>
        <span className="dropdown-caret">{isOpen ? '▲' : '▼'}</span>
      </button>

      {isOpen && (
        <div className="open-menu-dropdown">
          <div className="open-menu-section">
            <div className="open-menu-header">Examples</div>
            <button
              className="open-menu-option"
              onClick={() => handleLoadExample('dual-pump')}
            >
              <span className="option-icon">🔧</span>
              <span className="option-text">
                <span className="option-title">Dual Pump Controller</span>
                <span className="option-desc">Lead/lag with 2oo3 voting</span>
              </span>
            </button>
            <button
              className="open-menu-option"
              onClick={() => handleLoadExample('traffic')}
            >
              <span className="option-icon">🚦</span>
              <span className="option-text">
                <span className="option-title">4-Way Intersection</span>
                <span className="option-desc">Traffic light with safety flash</span>
              </span>
            </button>
          </div>

          <div className="open-menu-divider" />

          <button
            className="open-menu-option"
            onClick={handleOpenLocalFile}
          >
            <span className="option-icon">📁</span>
            <span className="option-text">
              <span className="option-title">Open Local File...</span>
              <span className="option-desc">Load .st file from disk</span>
            </span>
          </button>

          <div className="open-menu-divider" />

          <button
            className="open-menu-option"
            onClick={handleExportPdf}
          >
            <span className="option-icon">⬇</span>
            <span className="option-text">
              <span className="option-title">Export PDF…</span>
              <span className="option-desc">Print ladder + CCW build guide</span>
            </span>
          </button>

          <button
            className="open-menu-option"
            onClick={handleExportInstructionList}
          >
            <span className="option-icon">📝</span>
            <span className="option-text">
              <span className="option-title">Export Instruction List…</span>
              <span className="option-desc">AB-style IL (.il) — XIC/OTE/TON/BST</span>
            </span>
          </button>

          <div className="open-menu-divider" />

          <button
            className="open-menu-option"
            onClick={handleLoadFromMira}
          >
            <span className="option-icon">🧠</span>
            <span className="option-text">
              <span className="option-title">Load Manifest from MIRA…</span>
              <span className="option-desc">
                {isBridgeEnabled()
                  ? 'Fetch tags + Modbus addresses for an asset'
                  : 'Bridge not configured (set VITE_MIRA_BASE_URL)'}
              </span>
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
