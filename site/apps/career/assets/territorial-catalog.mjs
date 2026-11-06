/** Expand the lightweight, source-backed territorial catalogue for the existing
 * career scoring API. Shared numerical templates are editorial activity models;
 * a missing condition stays unknown and is never borrowed from a federal donor.
 */
export function expandTerritorialCatalog(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload?.schemaVersion !== 1 || !Array.isArray(payload.authorities)
      || !payload.templates || typeof payload.templates !== 'object') {
    throw new Error('career/invalid-territorial-catalog');
  }
  const seen = new Set();
  return payload.authorities.map((item) => {
    const template = payload.templates[item.scoringKey];
    if (!item.id || seen.has(item.id) || !template?.tracks?.length || !template?.sectors?.length) {
      throw new Error('career/invalid-territorial-authority');
    }
    seen.add(item.id);
    const corporation = item.level === 'national-corporation';
    return {
      ...item,
      shortName: item.shortName || '',
      entityType: corporation ? 'corporation' : item.level,
      entityTypeLabel: corporation ? 'Государственная корпорация'
        : item.level === 'municipal' ? 'Орган местного самоуправления'
          : 'Орган власти субъекта Российской Федерации',
      employerType: corporation ? 'state-corporation'
        : item.level === 'municipal' ? 'municipal-service-authority' : 'regional-state-body',
      descriptionParagraphs: [item.mission],
      descriptionSources: [{url: item.sourceUrl, checkedAt: item.verifiedAt}],
      tracks: template.tracks,
      sectors: template.sectors,
      sourceSnapshotAt: item.sourceSnapshotAt || payload.sourceSnapshotAt,
      familiarity: 1,
      confidence: 'limited',
      entryRouteIds: [],
      scoringProvenance: {
        kind: item.coding === 0 ? 'retained-editorial-functional-families'
          : 'editorial-description-and-function-coding',
        donorIds: template.donorIds,
        workingConditionsInherited: false,
        jobRequirementsInherited: false,
        psychometricallyValidated: false,
      },
    };
  });
}

/** Only these shards are needed for the national group and selected subjects. */
export function selectedPositionMaterialShards(manifest, regionIds = []) {
  if (manifest?.schemaVersion !== 1 || !Array.isArray(manifest.regions)) {
    throw new Error('career/invalid-position-manifest');
  }
  const ids = new Set(regionIds);
  return [manifest.national, ...manifest.regions.filter((row) => ids.has(row.regionId))]
    .filter((row) => row && Number(row.count) > 0 && /^data\/position-materials\/(national|ru-\d{2})\.json$/.test(row.path));
}

/** Merge the full source-backed description loaded on a card's details toggle. */
export function mergeTerritorialAuthorityDetails(authority, payload) {
  if (payload?.schemaVersion !== 1 || !Array.isArray(payload.authorities)) {
    throw new Error('career/invalid-authority-details');
  }
  const detail = payload.authorities.find((item) => item.id === authority.id);
  if (!detail || detail.regionId !== authority.regionId || detail.level !== authority.level) {
    throw new Error('career/authority-details-mismatch');
  }
  return {...authority, ...detail};
}
