'use client';

import { Waypoint } from '@/lib/types';
import PlaceAutocomplete from './PlaceAutocomplete';
import HerePlaceAutocomplete from './HerePlaceAutocomplete';
import type { MapProviderChoice } from './MapProviderPicker';

interface PlaceSearchProps {
  onPlaceSelect: (waypoint: Waypoint) => void;
  placeholder?: string;
  disabled?: boolean;
  currentMapProvider?: MapProviderChoice | null;
}

export default function PlaceSearch(props: PlaceSearchProps) {
  const provider = props.currentMapProvider ?? process.env.NEXT_PUBLIC_MAP_PROVIDER;
  if (provider === 'here') return <HerePlaceAutocomplete {...props} />;
  return <PlaceAutocomplete {...props} />;
}
