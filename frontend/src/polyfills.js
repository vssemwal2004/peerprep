// Small fallbacks for methods the app uses that older Safari / iOS (before 15.4) does not have.
// Each one is installed only when the browser lacks it, so modern browsers use their own.

function defineMissing(target, name, value) {
  if (!target || typeof target[name] === 'function') return;
  Object.defineProperty(target, name, { value, writable: true, configurable: true, enumerable: false });
}

// arr.at(-1), str.at(0)
function at(index) {
  const length = this.length >>> 0;
  let position = Math.trunc(Number(index)) || 0;
  if (position < 0) position += length;
  if (position < 0 || position >= length) return undefined;
  return this[position];
}
defineMissing(Array.prototype, 'at', at);
defineMissing(String.prototype, 'at', function stringAt(index) { return at.call(String(this), index); });

defineMissing(Array.prototype, 'findLast', function findLast(predicate, thisArg) {
  for (let index = this.length - 1; index >= 0; index -= 1) {
    if (predicate.call(thisArg, this[index], index, this)) return this[index];
  }
  return undefined;
});
defineMissing(Array.prototype, 'findLastIndex', function findLastIndex(predicate, thisArg) {
  for (let index = this.length - 1; index >= 0; index -= 1) {
    if (predicate.call(thisArg, this[index], index, this)) return index;
  }
  return -1;
});

defineMissing(Object, 'hasOwn', (object, key) => Object.prototype.hasOwnProperty.call(Object(object), key));

// Deep copy of the plain data the app clones (objects, arrays, dates, maps, sets).
function cloneValue(value, seen) {
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return seen.get(value);
  if (value instanceof Date) return new Date(value.getTime());
  if (value instanceof RegExp) return new RegExp(value.source, value.flags);
  if (value instanceof Map) {
    const copy = new Map();
    seen.set(value, copy);
    value.forEach((entry, key) => copy.set(cloneValue(key, seen), cloneValue(entry, seen)));
    return copy;
  }
  if (value instanceof Set) {
    const copy = new Set();
    seen.set(value, copy);
    value.forEach((entry) => copy.add(cloneValue(entry, seen)));
    return copy;
  }
  const copy = Array.isArray(value) ? [] : {};
  seen.set(value, copy);
  Object.keys(value).forEach((key) => { copy[key] = cloneValue(value[key], seen); });
  return copy;
}
if (typeof globalThis.structuredClone !== 'function') {
  globalThis.structuredClone = (value) => cloneValue(value, new Map());
}
