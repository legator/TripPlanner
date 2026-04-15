'use client';

import { useEffect, useRef } from 'react';
import { useGoogleMaps } from './GoogleMapsProvider';
import { Waypoint } from '@/lib/types';

interface PlaceAutocompleteProps {
  onPlaceSelect: (waypoint: Waypoint) => void;
  disabled?: boolean;
  placeholder?: string;
}

export default function PlaceAutocomplete({
  onPlaceSelect,
  disabled = false,
  placeholder = 'Search for a place...',
}: PlaceAutocompleteProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const elementCreatedRef = useRef(false);
  const onPlaceSelectRef = useRef(onPlaceSelect);
  const { isLoaded } = useGoogleMaps();

  // Keep callback ref in sync without re-running the effect
  useEffect(() => {
    onPlaceSelectRef.current = onPlaceSelect;
  }, [onPlaceSelect]);

  useEffect(() => {
    if (!isLoaded || !containerRef.current || elementCreatedRef.current) return;
    elementCreatedRef.current = true;

    // Create the new PlaceAutocompleteElement web component
    const placeAutocomplete = new google.maps.places.PlaceAutocompleteElement({});

    // Style the web component container
    placeAutocomplete.style.width = '100%';

    // Listen for place selection (gmp-select event per current API)
    placeAutocomplete.addEventListener('gmp-select', async (event: Event & { placePrediction?: google.maps.places.PlacePrediction }) => {
      const { placePrediction } = event;
      if (!placePrediction) return;

      try {
        const place = placePrediction.toPlace();

        // Fetch full place details
        await place.fetchFields({
          fields: ['displayName', 'formattedAddress', 'location', 'id'],
        });

        const location = place.location;
        if (!location) return;

        const waypoint: Waypoint = {
          id: crypto.randomUUID(),
          name: place.displayName || place.formattedAddress || 'Unknown',
          address: place.formattedAddress || '',
          location: {
            lat: location.lat(),
            lng: location.lng(),
          },
          placeId: place.id || undefined,
        };

        onPlaceSelectRef.current(waypoint);

        // Clear the input after selection
        const input = placeAutocomplete.querySelector('input');
        if (input) {
          input.value = '';
        }
      } catch (err) {
        console.error('Error fetching place details:', err);
      }
    });

    containerRef.current.appendChild(placeAutocomplete as unknown as Node);

    // If the web component provides an internal input, set its placeholder for clarity
    try {
      const inputEl = (placeAutocomplete as unknown as HTMLElement).querySelector?.('input');
      if (inputEl && 'placeholder' in inputEl) {
        (inputEl as HTMLInputElement).placeholder = placeholder;
      }
    } catch {}

    const container = containerRef.current;
    return () => {
      if (container) {
        container.innerHTML = '';
      }
      elementCreatedRef.current = false;
    };
  }, [isLoaded, placeholder]);

  if (!isLoaded) {
    return (
      <input
        type="text"
        placeholder={placeholder}
        disabled
        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg
                   bg-gray-100 cursor-not-allowed placeholder:text-gray-400"
      />
    );
  }

  return (
    <div
      ref={containerRef}
      className={`place-autocomplete-wrapper ${disabled ? 'opacity-50 pointer-events-none' : ''}`}
    />
  );
}
