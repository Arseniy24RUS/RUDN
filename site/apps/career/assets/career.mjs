export const MAX_COMPARE = 3;

export function importanceLabel(value) {
  if (Number(value) >= 3) return "Определяющий трек";
  if (Number(value) === 2) return "Существенный трек";
  return "Отдельные подразделения";
}

export function careerProfileMap(careerFramework = {}) {
  return new Map((careerFramework.trackProfiles || []).map((item) => [item.id, item]));
}

export function competencyMap(competencies = []) {
  return new Map(competencies.map((item) => [item.id, item]));
}

export function buildAuthorityCareerRoles(authority, careerFramework, competencies, limit = 5) {
  if (!authority) return [];
  const profiles = careerProfileMap(careerFramework);
  const skills = competencyMap(competencies);
  const sectors = (authority.sectors || []).slice().sort((a, b) => Number(b.weight || 0) - Number(a.weight || 0));
  return (authority.tracks || [])
    .slice()
    .sort((a, b) => Number(b.importance || 0) - Number(a.importance || 0))
    .slice(0, limit)
    .map((link, index) => {
      const profile = profiles.get(link.id);
      if (!profile) return null;
      return {
        id: `${authority.id}-${link.id}`,
        trackId: link.id,
        title: profile.title,
        description: profile.description || "",
        importance: Number(link.importance || 1),
        importanceLabel: importanceLabel(link.importance),
        unitFamilies: profile.unitFamilies || [],
        entryRoles: profile.entryRoles || [],
        growthRoles: profile.growthRoles || [],
        tasks: profile.tasks || [],
        competencies: (profile.competencyIds || []).map((id) => skills.get(id)).filter(Boolean),
        education: profile.education || { core: [], adjacent: [] },
        portfolio: profile.portfolio || [],
        primarySectorId: sectors[0]?.id || null,
        sectorIds: sectors.slice(0, 3).map((entry) => entry.id)
      };
    })
    .filter(Boolean);
}

export function relevantEntryRoutes(authority, entryRoutes = []) {
  const ids = new Set(authority?.entryRouteIds || []);
  return entryRoutes.filter((route) => ids.has(route.id));
}

export function addCompareId(compareIds = [], authorityId, max = MAX_COMPARE) {
  const clean = [...new Set(compareIds.filter(Boolean))];
  if (clean.includes(authorityId)) return { ids: clean.filter((id) => id !== authorityId), removed: true, full: false };
  if (clean.length >= max) return { ids: clean, removed: false, full: true };
  return { ids: [...clean, authorityId], removed: false, full: false };
}

export function sanitizeCompareIds(compareIds = [], authorities = [], max = MAX_COMPARE) {
  const valid = new Set(authorities.map((item) => item.id));
  return [...new Set(compareIds)].filter((id) => valid.has(id)).slice(0, max);
}

export function compareAuthoritySet(compareIds = [], authorities = []) {
  const byId = new Map(authorities.map((item) => [item.id, item]));
  return compareIds.map((id) => byId.get(id)).filter(Boolean);
}

export function buildTrackDevelopmentPlan(trackProfile, competencyLookup = new Map()) {
  if (!trackProfile) return null;
  const competencies = (trackProfile.competencyIds || [])
    .map((id) => competencyLookup.get(id))
    .filter(Boolean);
  return {
    title: trackProfile.title,
    competencies: competencies.slice(0, 6),
    portfolio: (trackProfile.portfolio || []).slice(0, 3),
    education: trackProfile.education || { core: [], adjacent: [] },
    firstSemester: [
      trackProfile.portfolio?.[0],
      competencies[0]?.evidenceIdeas?.[0],
      competencies[1]?.evidenceIdeas?.[0]
    ].filter(Boolean).slice(0, 3)
  };
}

export function careerSystemLabel(authority) {
  if (!authority) return "";
  if (["corporation", "fund"].includes(authority.entityType)) return "Собственная система найма работодателя публичного сектора";
  if (["svr","fsb","gusp","fso"].includes(authority.id)) return "Специальный порядок и ограниченная открытая информация";
  return "Федеральная государственная служба и иные предусмотренные органом способы входа";
}
