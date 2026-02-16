'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export interface SearchableSelectOption {
  value: string;
  label: string;
  description?: string;
  searchText?: string;
}

interface SearchableSelectProps {
  value: string;
  options: SearchableSelectOption[];
  onValueChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
}

export function SearchableSelect({
  value,
  options,
  onValueChange,
  placeholder = 'Select option',
  searchPlaceholder = 'Search...',
  emptyMessage = 'No options found',
  disabled,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(
    () => options.find((item) => item.value === value) || null,
    [options, value],
  );

  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return options;
    }

    return options.filter((item) => {
      const target = `${item.label} ${item.value} ${item.description || ''} ${item.searchText || ''}`.toLowerCase();
      return target.includes(normalizedQuery);
    });
  }, [options, query]);

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  useEffect(() => {
    if (!open) {
      setQuery('');
      return;
    }

    const id = setTimeout(() => {
      searchInputRef.current?.focus();
    }, 0);

    return () => clearTimeout(id);
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        className={cn(
          'flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm',
          'disabled:cursor-not-allowed disabled:opacity-50',
        )}
        onClick={() => setOpen((previous) => !previous)}
        disabled={disabled}
      >
        <span className="truncate text-left">
          {selected ? (
            selected.description ? `${selected.label} - ${selected.description}` : selected.label
          ) : (
            <span className="text-gray-500">{placeholder}</span>
          )}
        </span>
        <ChevronDown className="ml-2 h-4 w-4 flex-shrink-0 text-gray-400" />
      </button>

      {open ? (
        <div className="absolute z-50 mt-2 w-full rounded-md border border-gray-200 bg-white p-2 shadow-lg">
          <div className="relative mb-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              ref={searchInputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={searchPlaceholder}
              className="pl-9"
            />
          </div>

          <div className="max-h-56 overflow-y-auto">
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-2 text-sm text-gray-500">{emptyMessage}</div>
            ) : (
              filteredOptions.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  className={cn(
                    'flex w-full items-center justify-between rounded px-3 py-2 text-left text-sm',
                    'hover:bg-gray-100',
                    value === item.value ? 'bg-blue-50 text-blue-700' : 'text-gray-800',
                  )}
                  onClick={() => {
                    onValueChange(item.value);
                    setOpen(false);
                  }}
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium">{item.label}</div>
                    {item.description ? <div className="truncate text-xs text-gray-500">{item.description}</div> : null}
                  </div>
                  {value === item.value ? <Check className="ml-2 h-4 w-4 flex-shrink-0" /> : null}
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
