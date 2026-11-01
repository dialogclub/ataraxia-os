// Shared Client Profile — единственный носитель состояния между модулями.
// Объект иммутабелен: каждое изменение возвращает новый Scp и добавляет запись в audit[].

const SCP_VERSION = '1.0';

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function emptyProfile(meta) {
  return {
    meta: {
      scp_version: SCP_VERSION,
      system: 'ATMARAKSI OS',
      mode: meta.mode,
      model: meta.model,
      fallback: false,
      created: meta.created,
      input_hash: meta.input_hash
    },
    subject: { alias: meta.alias, sex: 'x', age_band: '', contour: 'civ', consent: {} },
    inputs: [],
    signals: {},
    lexis: {},
    request: { explicit: '', latent: '', veracity: {}, displacements: [] },
    obstacle: {}, intuition: {}, insight: {}, liberty: {}, quality: {},
    czi8: {},
    cascade: {},
    drives: {},
    frames: {},
    clinic: {},
    body: {},
    practice: {},
    narrative: {},
    memory: { similar: [] },
    synthesis: { verdicts: [], axes: [], plan: [], risks: [] },
    evidence: [],
    audit: []
  };
}

export class Scp {
  constructor(data) {
    this.data = Object.freeze(cloneJson(data));
    Object.freeze(this);
  }

  static fresh(meta) {
    return new Scp(emptyProfile(meta));
  }

  // Запись по пути «cascade.B» от имени агента/инструмента; возвращает новый профиль.
  with(path, value, who) {
    const next = cloneJson(this.data);
    const parts = path.split('.');
    let cursor = next;
    parts.slice(0, -1).forEach((key) => {
      if (typeof cursor[key] !== 'object' || cursor[key] === null) cursor[key] = {};
      cursor = cursor[key];
    });
    cursor[parts[parts.length - 1]] = cloneJson(value);
    next.audit.push({ who, what: `write ${path}`, when: new Date().toISOString() });
    return new Scp(next);
  }

  withEvidence(item, who) {
    const next = cloneJson(this.data);
    next.evidence.push(cloneJson(item));
    next.audit.push({ who, what: `evidence ${item.claim_id}`, when: new Date().toISOString() });
    return new Scp(next);
  }

  at(path) {
    return path.split('.').reduce((acc, key) => (acc === undefined ? undefined : acc[key]), this.data);
  }

  json() {
    return cloneJson(this.data);
  }

  // Round-trip: экспорт → импорт → идентичный профиль (харнесс типа 7).
  static fromJson(text) {
    return new Scp(JSON.parse(text));
  }

  text() {
    return JSON.stringify(this.data, null, 2);
  }
}
