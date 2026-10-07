import { HttpError } from '../utils/errors.js';

// Split only outside quoted data and comments; a semicolon inside a string
// must not be mistaken for an extra SQL statement.
export function sqlStatementKinds(source) {
  let quote = '', statement = '', statements = [];
  for (let i = 0; i < source.length; i++) {
    const c = source[i], next = source[i + 1];
    if (quote) {
      if (c === quote) { if (next === quote) i++; else quote = ''; }
      continue;
    }
    if (c === '-' && next === '-') { while (i < source.length && source[i] !== '\n') i++; statement += ' '; continue; }
    if (c === '/' && next === '*') { i += 2; while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) i++; i++; statement += ' '; continue; }
    if (['\'', '"', '`'].includes(c)) { quote = c; statement += ' '; continue; }
    if (c === '[') { quote = ']'; statement += ' '; continue; }
    if (c === ';') { if (statement.trim()) statements.push(statement.trim()); statement = ''; }
    else statement += c;
  }
  if (statement.trim()) statements.push(statement.trim());
  return statements.map(value => value.match(/^[a-z]+/i)?.[0]?.toLowerCase() || '');
}

export function validateSqlMutationContract(source, requiredStatement) {
  if (!requiredStatement) return;
  const kinds = sqlStatementKinds(String(source));
  if (!['update', 'delete'].includes(requiredStatement) || kinds.length !== 1 || kinds[0] !== requiredStatement) {
    throw new HttpError(400, `This question requires exactly one ${String(requiredStatement).toUpperCase()} statement.`);
  }
}
