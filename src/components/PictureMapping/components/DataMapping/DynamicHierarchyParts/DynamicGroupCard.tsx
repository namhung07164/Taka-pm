import React, { memo } from 'react';
import { Group, GroupRule } from '../types';
import { ColorPicker } from '../../ColorPicker';
import { GroupHatchPatternPicker } from '../GroupHatchPatternPicker';
import { GroupSymbolPicker } from '../GroupSymbolPicker';
import { HatchPatternType, getHatchCssStyle } from '../../../../LayoutTabParts/layoutPatternUtils';
import { DynamicRuleRow } from './DynamicRuleRow';
import { Plus, Trash2, Edit2 } from 'lucide-react';

interface DynamicGroupCardProps {
  group: Group;
  matchedUnits: string[];
  totalAreaM2?: number;
  onUpdateGroupColor: (groupId: string, color: string) => void;
  onUpdateGroupOpacity: (groupId: string, opacity: number) => void;
  onUpdateGroupHatchPattern: (groupId: string, pattern: HatchPatternType) => void;
  onUpdateGroupSymbol: (groupId: string, symbol: string) => void;
  onRenameGroup: (groupId: string, e: React.MouseEvent) => void;
  onDeleteGroup: (groupId: string, e?: React.MouseEvent) => void;
  onAddRule: (groupId: string) => void;
  onUpdateRule: (groupId: string, ruleIndex: number, attr: keyof GroupRule, value: string) => void;
  onDeleteRule: (groupId: string, ruleIndex: number) => void;
}

export const DynamicGroupCard = memo(function DynamicGroupCard({
  group,
  matchedUnits,
  totalAreaM2,
  onUpdateGroupColor,
  onUpdateGroupOpacity,
  onUpdateGroupHatchPattern,
  onUpdateGroupSymbol,
  onRenameGroup,
  onDeleteGroup,
  onAddRule,
  onUpdateRule,
  onDeleteRule,
}: DynamicGroupCardProps) {
  return (
    <div className="border border-slate-700/80 rounded-lg overflow-hidden bg-slate-900/80 hover:border-brand-500/50 transition-colors">
      <div className="px-2.5 py-1.5 bg-slate-800/90 border-b border-slate-700/80 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
          <div className="relative flex items-center justify-center shrink-0">
            <ColorPicker
              color={group.color}
              onChange={(color) => onUpdateGroupColor(group.id, color)}
              className="shrink-0"
            />
            {group.hatchPattern && group.hatchPattern !== 'none' && (
              <span
                className="absolute inset-0 rounded pointer-events-none"
                style={getHatchCssStyle(group.color, group.hatchPattern)}
              />
            )}
            {group.symbol && (
              <span className="absolute inset-0 flex items-center justify-center text-[9px] font-black text-white pointer-events-none drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]">
                {group.symbol}
              </span>
            )}
          </div>

          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={group.opacity ?? 0.6}
            title={`Opacity: ${group.opacity ?? 0.6}`}
            onChange={(e) => onUpdateGroupOpacity(group.id, parseFloat(e.target.value))}
            className="w-10 h-1 accent-brand-500 shrink-0 cursor-pointer"
          />

          <GroupHatchPatternPicker
            color={group.color}
            pattern={group.hatchPattern || 'none'}
            onChange={(pat) => onUpdateGroupHatchPattern(group.id, pat)}
          />

          <GroupSymbolPicker
            symbol={group.symbol || ''}
            onChange={(sym) => onUpdateGroupSymbol(group.id, sym)}
          />

          <span 
            className="text-xs font-bold text-white ml-0.5 cursor-pointer hover:text-brand-400 transition-colors flex items-center gap-1 group/title truncate"
            onClick={(e) => onRenameGroup(group.id, e)}
          >
            {group.symbol && (
              <span className="text-amber-400 font-mono text-[10px] px-1 py-0.1 rounded bg-amber-950/60 border border-amber-800/80">
                {group.symbol}
              </span>
            )}
            <span className="truncate">{group.name}</span>
            <Edit2 size={10} className="text-slate-500 group-hover/title:text-brand-400 shrink-0" />
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-950 text-brand-400 border border-slate-700">
            {matchedUnits.length} units
            {totalAreaM2 !== undefined && totalAreaM2 > 0 && ` • ${totalAreaM2.toFixed(1)}m²`}
          </span>
          <button
            onClick={(e) => onDeleteGroup(group.id, e)}
            className="text-slate-500 hover:text-red-400 p-1 rounded hover:bg-slate-700/50 transition-colors"
            title="Delete Group"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      <div className="p-2.5 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
            Matching Rules ({group.rules?.length || 0})
          </span>
          <button
            onClick={() => onAddRule(group.id)}
            className="text-[9.5px] uppercase font-bold text-brand-400 hover:text-brand-300 flex items-center gap-0.5 transition-colors"
          >
            <Plus size={11} /> Add Rule
          </button>
        </div>

        {(!group.rules || group.rules.length === 0) ? (
          <div className="text-[11px] text-slate-500 italic py-1">
            No rules defined. Add a rule to dynamically assign units.
          </div>
        ) : (
          <div className="space-y-1.5">
            {group.rules.map((rule, idx) => (
              <DynamicRuleRow
                key={idx}
                groupId={group.id}
                ruleIndex={idx}
                rule={rule}
                onUpdateRule={onUpdateRule}
                onDeleteRule={onDeleteRule}
              />
            ))}
          </div>
        )}

        {group.rules && group.rules.length > 0 && matchedUnits.length > 0 && (
          <div className="pt-1.5 mt-1 border-t border-slate-800/50">
            <span className="text-[9px] uppercase text-slate-500 font-bold mb-1 block">
              Matched Units ({matchedUnits.length})
            </span>
            <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto custom-scrollbar">
              {matchedUnits.map((uId) => (
                <span
                  key={uId}
                  className="px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800 text-[9.5px] font-mono text-slate-300"
                >
                  {uId}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});
