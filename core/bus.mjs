// Шина событий: модули не общаются напрямую (инвариант 4).
// Маленький иммутабельный объект; подписчики хранятся в замыкании.

export class EventBus {
  constructor(log) {
    this.log = log === undefined ? [] : log;
    this.handlers = new Map();
    Object.freeze(this);
  }

  on(topic, handler) {
    const list = this.handlers.get(topic) === undefined ? [] : this.handlers.get(topic);
    this.handlers.set(topic, list.concat([handler]));
    return () => {
      const current = this.handlers.get(topic) === undefined ? [] : this.handlers.get(topic);
      this.handlers.set(topic, current.filter((h) => h !== handler));
    };
  }

  // Событие записывается в журнал даже без подписчиков — телеметрия локальная.
  emit(topic, payload) {
    const record = Object.freeze({ topic, payload, at: new Date().toISOString() });
    this.log.push(record);
    const list = this.handlers.get(topic) === undefined ? [] : this.handlers.get(topic);
    list.forEach((h) => h(payload, record));
    const any = this.handlers.get('*') === undefined ? [] : this.handlers.get('*');
    any.forEach((h) => h(payload, record));
    return record;
  }

  history() {
    return this.log.slice();
  }
}
