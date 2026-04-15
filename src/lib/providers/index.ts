import { RoutingProvider } from './types';
import { googleProvider } from './google';
import { hereProvider } from './here';

export type MapProviderName = 'google' | 'here';

export function getMapProviderName(): MapProviderName {
  const val = process.env.MAP_PROVIDER || process.env.NEXT_PUBLIC_MAP_PROVIDER;
  return val === 'here' ? 'here' : 'google';
}

export function getRoutingProvider(): RoutingProvider {
  return getMapProviderName() === 'here' ? hereProvider : googleProvider;
}

export type { RoutingProvider, RouteResult, RouteLeg, RouteStep, NearbyPlace } from './types';
