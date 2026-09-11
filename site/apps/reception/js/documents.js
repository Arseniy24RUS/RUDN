/** Documentary grounds are answers; the comparison desk is only a reading tool.
 * Neither opening nor comparing files awards points or fills an answer.
 */
export function validDocumentSelection(c, ids, maximum = c.documents.length) {
  return Array.isArray(ids) && ids.length <= maximum && new Set(ids).size === ids.length &&
    ids.every(id => typeof id === 'string' && c.documents.some(d => d.id === id));
}

export function toggleComparisonDocument(c, current, id) {
  if (!validDocumentSelection(c, current, 2) || !c.documents.some(d => d.id === id)) {
    throw new Error('Неизвестный документ для сопоставления.');
  }
  if (current.includes(id)) return current.filter(value => value !== id);
  // A third document replaces the oldest, not any of the student's scored answers.
  return [...current.slice(-1), id];
}

export function documentEvidenceCheck(c, answer) {
  const sets = c.factTask.evidenceSets;
  if (!sets) return {matched: (c.factTask.evidence || [c.documents[0].id]).includes(answer.factEvidence), paired: false};
  const chosen = answer.factEvidenceIds || [];
  const valid = validDocumentSelection(c, chosen);
  const matched = valid && sets.some(set => set.length === chosen.length && set.every(id => chosen.includes(id)));
  return {matched, paired: true};
}

export function requiredActionPlan(c, route) {
  if (!c.decisionPlans) return {id: 'default', validRoute: c.correctRoutes.includes(route), requiredActions: c.actions.filter(a => a.good).map(a => a.id), order: c.order};
  const selected = c.decisionPlans.find(plan => plan.routes.includes(route));
  return selected ? {...selected, validRoute: true} : {id: 'unselected', validRoute: false, requiredActions: [], order: []};
}

/** Authoring checks. Invalid keys cannot silently turn into an impossible task. */
export function validateDocumentContract(c) {
  const errors = [], docs = c.documents.map(d => d.id), actionIds = c.actions.map(a => a.id);
  if (new Set(docs).size !== docs.length) errors.push('Повторяющиеся ID документов');
  if (c.factTask.evidenceSets) {
    if (!Array.isArray(c.factTask.evidenceSets) || !c.factTask.evidenceSets.length) errors.push('Нет наборов документальных оснований');
    else for (const set of c.factTask.evidenceSets) if (!validDocumentSelection(c, set) || set.length < 2) errors.push('Некорректный набор документальных оснований');
  }
  if (c.decisionPlans) {
    const covered = [];
    for (const plan of c.decisionPlans) {
      if (!plan.id || !plan.routes?.length || !plan.requiredActions?.length) {errors.push('Неполный альтернативный план'); continue;}
      for (const r of plan.routes) {if (!c.correctRoutes.includes(r) || covered.includes(r)) errors.push('Неоднозначное покрытие маршрутов'); covered.push(r);}
      if (new Set(plan.requiredActions).size !== plan.requiredActions.length || plan.requiredActions.some(id => !actionIds.includes(id) || !c.actions.find(a => a.id === id).good)) errors.push('Неизвестное или ошибочное обязательное действие');
      for (const pair of plan.order || []) if (pair.length !== 2 || pair[0] === pair[1] || pair.some(id => !plan.requiredActions.includes(id))) errors.push('Некорректная зависимость действий');
      // Topological elimination detects a cycle regardless of the displayed order.
      const left = new Set(plan.requiredActions), edges = plan.order || [];
      while (left.size) {const free = [...left].filter(id => !edges.some(([before, after]) => after === id && left.has(before))); if (!free.length) {errors.push('Циклический порядок действий'); break;} free.forEach(id => left.delete(id));}
    }
    if (c.correctRoutes.some(r => !covered.includes(r))) errors.push('Допустимый маршрут не имеет плана');
  }
  return errors;
}
