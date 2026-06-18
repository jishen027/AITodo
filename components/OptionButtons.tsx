'use client';

import { useState } from 'react';
import { Check, Send, PenLine } from 'lucide-react';
import { ChatOptions } from '@/types';

interface Props {
  options: ChatOptions;
  disabled: boolean;
  onSend: (text: string) => void;
}

export default function OptionButtons({ options, disabled, onSend }: Props) {
  const [selected, setSelected] = useState<string[]>([]);
  const [showCustom, setShowCustom] = useState(false);
  const [customText, setCustomText] = useState('');

  const handleSingle = (opt: string) => {
    if (disabled) return;
    onSend(opt);
  };

  const toggleMulti = (opt: string) => {
    if (disabled) return;
    setSelected((prev) =>
      prev.includes(opt) ? prev.filter((o) => o !== opt) : [...prev, opt]
    );
  };

  const sendMulti = () => {
    if (disabled || selected.length === 0) return;
    onSend(selected.join(', '));
    setSelected([]);
  };

  const sendCustom = () => {
    const text = customText.trim();
    if (disabled || !text) return;
    onSend(text);
    setCustomText('');
    setShowCustom(false);
  };

  return (
    <div className="px-4 pb-3 flex flex-col gap-2.5">
      <div className="flex flex-wrap gap-2">
        {options.options.map((opt) => {
          const isSelected = selected.includes(opt);
          return (
            <button
              key={opt}
              onClick={() =>
                options.type === 'single' ? handleSingle(opt) : toggleMulti(opt)
              }
              disabled={disabled}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-sm rounded-full border transition-all select-none
                ${
                  options.type === 'multi' && isSelected
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                    : 'border-indigo-200 bg-white text-indigo-700 hover:bg-indigo-50 hover:border-indigo-400'
                }
                disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              {options.type === 'multi' && isSelected && (
                <Check className="w-3 h-3 shrink-0" />
              )}
              {opt}
            </button>
          );
        })}

        <button
          onClick={() => setShowCustom((v) => !v)}
          disabled={disabled}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-sm rounded-full border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed select-none"
        >
          <PenLine className="w-3 h-3 shrink-0" />
          Other…
        </button>
      </div>

      {options.type === 'multi' && selected.length > 0 && (
        <button
          onClick={sendMulti}
          disabled={disabled}
          className="self-start inline-flex items-center gap-1.5 px-4 py-1.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          <Send className="w-3.5 h-3.5" />
          Send ({selected.length} selected)
        </button>
      )}

      {showCustom && (
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) sendCustom();
              if (e.key === 'Escape') setShowCustom(false);
            }}
            placeholder="Type your answer…"
            autoFocus
            className="flex-1 px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all"
          />
          <button
            onClick={sendCustom}
            disabled={!customText.trim() || disabled}
            aria-label="Send custom answer"
            className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg disabled:opacity-40 transition"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
