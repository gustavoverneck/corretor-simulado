export const DEFAULT_OMR_SETTINGS = Object.freeze({ markThreshold: 0.38, ambiguityThreshold: 0.25 })

export const OMR_PROFILES = [
  { id: 'photo', label: 'Foto com sombra', description: '38% de rigor · 25% na zona de dúvida. Filtra sinais fracos de sombra; confira marcas leves na prévia.', settings: DEFAULT_OMR_SETTINGS },
  { id: 'balanced', label: 'Mais cauteloso', description: '38% de rigor · 22% na zona de dúvida. Encaminha mais marcas fracas para revisão.', settings: { markThreshold: 0.38, ambiguityThreshold: 0.22 } },
]

export function resolveOmrSettings(settings = {}) {
  settings = settings || {}
  const bounded = (value, fallback, min, max) => {
    const parsed = Number(value ?? fallback)
    return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback
  }
  return {
    ...settings,
    markThreshold: bounded(settings.markThreshold, DEFAULT_OMR_SETTINGS.markThreshold, 0.25, 0.6),
    ambiguityThreshold: bounded(settings.ambiguityThreshold, DEFAULT_OMR_SETTINGS.ambiguityThreshold, 0.1, 0.35),
  }
}
