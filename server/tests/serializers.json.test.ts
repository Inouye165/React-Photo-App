const {
  safeJsonParse,
  safeParseArray,
  safeParseObject,
  safeParseUnknown,
} = require('../serializers/json');

describe('serializers/json', () => {
  test('safeJsonParse parses valid JSON string', () => {
    expect(safeJsonParse('{"a":1}')).toEqual({ a: 1 });
  });

  test('safeJsonParse returns null for invalid JSON string', () => {
    expect(safeJsonParse('{"a":')).toBeNull();
  });

  test('safeJsonParse returns null for null/undefined/empty string', () => {
    expect(safeJsonParse(null)).toBeNull();
    expect(safeJsonParse(undefined)).toBeNull();
    expect(safeJsonParse('')).toBeNull();
    expect(safeJsonParse('   ')).toBeNull();
  });

  test('safeJsonParse returns as-is for already-object/array', () => {
    const obj = { a: 1 };
    const arr = [1, 2, 3];
    expect(safeJsonParse(obj)).toBe(obj);
    expect(safeJsonParse(arr)).toBe(arr);
  });

  test('safeParseObject returns object or null', () => {
    expect(safeParseObject('{"a":1}')).toEqual({ a: 1 });
    expect(safeParseObject('[1,2]')).toBeNull();
    expect(safeParseObject(null)).toBeNull();
  });

  test('safeParseArray returns array or null', () => {
    expect(safeParseArray('[1,2]')).toEqual([1, 2]);
    expect(safeParseArray('{"a":1}')).toBeNull();
    expect(safeParseArray(undefined)).toBeNull();
  });

  test('safeParseUnknown is passthrough of safeJsonParse semantics', () => {
    expect(safeParseUnknown('{"a":1}')).toEqual({ a: 1 });
    expect(safeParseUnknown('{bad')).toBeNull();
  });
});
