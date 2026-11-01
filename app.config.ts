import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * App-Varianten, damit Dev-, Test- und stabile Version gleichzeitig
 * auf einem Handy installiert sein können.
 *
 * APP_VARIANT wird in eas.json pro Build-Profil gesetzt:
 *   development → Branch feature/*  (Development Build)
 *   test        → Branch test       (Test-APK)
 *   (leer)      → Branch main       (stabile Version)
 */
const BASE_ID = 'io.github.sb0097.flimmer';
const variant = process.env.APP_VARIANT;

const variants: Record<string, { suffix: string; name: string }> = {
  development: { suffix: '.dev', name: 'Flimmer Dev' },
  test: { suffix: '.test', name: 'Flimmer Test' },
};

export default ({ config }: ConfigContext): ExpoConfig => {
  const v = variant ? variants[variant] : undefined;
  const id = BASE_ID + (v?.suffix ?? '');

  return {
    ...config,
    name: v?.name ?? 'Flimmer',
    slug: 'flimmer',
    ios: { ...config.ios, bundleIdentifier: id },
    android: { ...config.android, package: id },
  };
};
