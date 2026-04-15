'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Waypoint } from '@/lib/types';

const HERE_API_KEY = process.env.NEXT_PUBLIC_HERE_API_KEY || '';

interface HerePlaceAutocompleteProps {
  onPlaceSelect: (waypoint: Waypoint) => void;
  placeholder?: string;
  disabled?: boolean;
}

interface Suggestion {
  id: string;
  title: string;
  address: { label: string };
  position?: { lat: number; lng: number };
  resultType?: string;
}

export default function HerePlaceAutocomplete({
  onPlaceSelect,
  placeholder = 'Search for a place...',
  disabled = false,
}: HerePlaceAutocompleteProps) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const fetchSuggestions = useCallback(async (q: string) => {
    if (q.length < 2) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }
    setIsLoading(true);
    try {
      const url = new URL('https://autosuggest.search.hereapi.com/v1/autosuggest');
      url.searchParams.set('apiKey', HERE_API_KEY);
      url.searchParams.set('q', q);
      url.searchParams.set('lang', 'en');
      url.searchParams.set('limit', '6');
      // Bias toward results with a known position
      url.searchParams.set('resultTypes', 'place,locality,administrativeArea');

      const res = await fetch(url.toString());
      const data = await res.json();
      const items: Suggestion[] = (data.items || []).filter(
        (item: any) => item.position || item.resultType !== 'chainQuery'
      );
      setSuggestions(items);
      setIsOpen(items.length > 0);
    } catch {
      setSuggestions([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(query), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, fetchSuggestions]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelect = async (suggestion: Suggestion) => {
    setIsOpen(false);
    setQuery('');

    // If the suggestion has a position, use it directly
    if (suggestion.position) {
      onPlaceSelect({
        id: crypto.randomUUID(),
        name: suggestion.title,
        address: suggestion.address.label,
        location: { lat: suggestion.position.lat, lng: suggestion.position.lng },
      });
      return;
    }

    // Otherwise look up coordinates via the HERE Lookup API
    try {
      const url = new URL('https://lookup.search.hereapi.com/v1/lookup');
      url.searchParams.set('apiKey', HERE_API_KEY);
      url.searchParams.set('id', suggestion.id);
      url.searchParams.set('lang', 'en');
      const res = await fetch(url.toString());
      const data = await res.json();
      if (data.position) {
        onPlaceSelect({
          id: crypto.randomUUID(),
          name: data.title || suggestion.title,
          address: data.address?.label || suggestion.address.label,
          location: { lat: data.position.lat, lng: data.position.lng },
        });
      }
    } catch {
      // Fallback: skip if lookup fails
    }
  };

  return (
    <div ref={wrapperRef} className="relative w-full">
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => suggestions.length > 0 && setIsOpen(true)}
          placeholder={placeholder}
          disabled={disabled}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white dark:placeholder-gray-400 disabled:opacity-50"
        />
        {isLoading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>

      {isOpen && suggestions.length > 0 && (
        <ul className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg overflow-hidden max-h-72 overflow-y-auto">
          {suggestions.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onMouseDown={() => handleSelect(s)}
                className="w-full text-left px-3 py-2.5 hover:bg-blue-50 dark:hover:bg-gray-700 transition-colors"
              >
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{s.title}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{s.address.label}</p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
