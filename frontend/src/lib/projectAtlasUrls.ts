const DEFAULT_ATLAS_APP_URL = 'https://project-atlas-next.vercel.app';

function localAtlasAppUrl() {
  return process.env.NODE_ENV === 'development'
    ? 'http://localhost:3200'
    : DEFAULT_ATLAS_APP_URL;
}

export function getProjectAtlasAppUrl() {
  const configuredAppUrl = process.env.NEXT_PUBLIC_ATLAS_APP_URL?.trim();
  if (configuredAppUrl) return configuredAppUrl;

  const configuredEmbedUrl = process.env.NEXT_PUBLIC_ATLAS_EMBED_URL?.trim();
  if (configuredEmbedUrl) {
    try {
      return new URL(configuredEmbedUrl).origin;
    } catch {
      // Fall through to the standard Atlas host for invalid optional config.
    }
  }

  return localAtlasAppUrl();
}

export function getProjectAtlasEmbedUrl() {
  const configuredEmbedUrl = process.env.NEXT_PUBLIC_ATLAS_EMBED_URL?.trim();
  if (configuredEmbedUrl) return configuredEmbedUrl;
  return new URL('/embed/gis', `${getProjectAtlasAppUrl().replace(/\/$/, '')}/`).toString();
}
