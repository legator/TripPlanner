'use client';

import { Waypoint } from '@/lib/types';
import PlaceAutocomplete from './PlaceAutocomplete';
import HerePlaceAutocomplete from './HerePlaceAutocomplete';

interface PlaceSearchProps {
  onPlaceSelect: (waypoint: Waypoint) => void;
  placeholder?: string;
  disabled?: boolean;
}

const MAP_PROVIDER = process.env.NEXT_PUBLIC_MAP_PROVIDER;

export default function PlaceSearch(props: PlaceSearchProps) {
  if (MAP_PROVIDER === 'here') {
    return <HerePlaceAutocomplete {...props} />;
  }
  return <PlaceAutocomplete {...props} />;
}
