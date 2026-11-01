// L0: разбор транскрипта «Спикер: реплика» — спикеры, реплики, псевдо-таймкод по номеру строки.
export class Transcript {
  constructor(text) {
    const lines = String(text === undefined ? '' : text).split('\n').map((l) => l.trim()).filter((l) => l !== '');
    // Формат строки: «[HH:MM] Спикер: реплика» либо «HH:MM:SS Спикер: реплика» либо «Спикер: реплика».
    this.lines = Object.freeze(lines.map((l, i) => {
      const tm = l.match(/^\[?(\d{1,2}:\d{2}(?::\d{2})?)\]?\s+(.*)$/);
      const body = tm ? tm[2] : l;
      const m = body.match(/^([^:]{1,24}):\s*(.+)$/);
      return Object.freeze({ n: i + 1, t: tm ? `[${tm[1]}]` : `#${i + 1}`, speaker: m ? m[1].trim() : '?', text: m ? m[2].trim() : body });
    }));
    Object.freeze(this);
  }

  speakers() {
    const counts = {};
    this.lines.forEach((l) => { counts[l.speaker] = (counts[l.speaker] === undefined ? 0 : counts[l.speaker]) + 1; });
    return counts;
  }

  textOf(speaker) {
    return this.lines.filter((l) => speaker === undefined || l.speaker === speaker).map((l) => l.text).join(' ');
  }

  statementsOf(speaker) {
    return this.lines.filter((l) => speaker === undefined || l.speaker === speaker).map((l) => l.text);
  }

  lexisLines() {
    return this.lines.map((l) => ({ speaker: l.speaker, text: l.text, t: l.t }));
  }

  empty() {
    return this.lines.length === 0;
  }
}

