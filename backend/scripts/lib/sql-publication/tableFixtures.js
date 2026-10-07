const identifier = (name) => {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error(`Invalid SQL identifier ${name}`);
  return `"${name}"`;
};

function asciiTables(text) {
  const result = [];
  let active = null;
  const lines = text.split('\n');
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index].trim();
    if (/^\|.*\|$/.test(line)) {
      const row = line.slice(1, -1).split('|').map((cell) => cell.trim());
      if (!active) {
        active = { header: row, rows: [], prefix: lines.slice(Math.max(0, index - 5), index).join('\n') };
        result.push(active);
      } else {
        if (row.length !== active.header.length) throw new Error('SQL example table has inconsistent column counts.');
        active.rows.push(row);
      }
    } else if (!/^\+[+\- ]+\+$/.test(line) && line) active = null;
  }
  return result;
}

function sqlType(type) {
  if (/^(?:int|bigint|smallint|tinyint|boolean|bool)/i.test(type)) return 'INTEGER';
  if (/^(?:float|double|decimal|numeric|real)/i.test(type)) return 'REAL';
  if (/^(?:varchar|char|text|date|time|enum)/i.test(type)) return 'TEXT';
  throw new Error(`Unsupported source SQL type ${type}`);
}

function tableName(prefix) {
  return prefix.match(/\bTable\s*:\s*([A-Za-z_]\w*)/i)?.[1]
    || prefix.match(/\b([A-Za-z_]\w*)\s+table\s*:/i)?.[1];
}

function sourceValue(value, type) {
  if (/^(?:null|none)$/i.test(value)) return null;
  if (type !== 'TEXT') {
    if (!/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value)) throw new Error(`Non-numeric source value ${value}`);
    return Number(value);
  }
  return value;
}

function literal(value) {
  if (value === null) return 'NULL';
  if (typeof value === 'number') return String(value);
  return `'${String(value).replaceAll("'", "''")}'`;
}

export function seedSql(schemas, tables) {
  return schemas.map((schema) => {
    const table = tables.find((entry) => entry.name.toLowerCase() === schema.name.toLowerCase());
    if (!table) return '';
    const indices = schema.columns.map((column) => table.columns.indexOf(column.name));
    if (indices.some((index) => index < 0)) throw new Error(`Source example columns do not match schema ${schema.name}`);
    return table.rows.map((row) => `INSERT INTO ${identifier(schema.name)} (${schema.columns.map((column) => identifier(column.name)).join(',')}) VALUES (${indices.map((index, columnIndex) => literal(sourceValue(row[index], schema.columns[columnIndex].type))).join(',')});`).join('\n');
  }).filter(Boolean).join('\n');
}

export function extractSqlFixtures(description) {
  const text = String(description || '').replace(/\r\n/g, '\n').replace(/\*\*|`/g, '');
  const schemas = asciiTables(text.slice(0, text.search(/\b(?:Example(?:\s*\d+)?|Input)\s*:/i)))
    .filter((table) => /column\s*name/i.test(table.header[0]) && /type/i.test(table.header[1]))
    .map((table) => {
      const name = tableName(table.prefix);
      if (!name) throw new Error('Cannot identify source SQL table.');
      return { name, columns: table.rows.map(([column, type]) => ({ name: column, type: sqlType(type) })) };
    });
  if (!schemas.length) throw new Error('No source SQL table schemas found.');
  const schemaSql = schemas.map((schema) => `CREATE TABLE ${identifier(schema.name)} (${schema.columns.map((column) => `${identifier(column.name)} ${column.type}`).join(',')});`).join('\n');
  const starts = [...text.matchAll(/\bInput\s*:/gi)];
  const samples = starts.map((match, index) => {
    const section = text.slice(match.index + match[0].length, starts[index + 1]?.index ?? text.length);
    const output = section.search(/\bOutput\s*:/i);
    if (output < 0) throw new Error('SQL source sample output is missing.');
    const inputText = section.slice(0, output);
    const outputText = section.slice(output).replace(/^Output\s*:/i, '').split(/\bExplanation\s*:/i)[0];
    const tables = asciiTables(inputText).map((table) => ({ name: tableName(table.prefix), columns: table.header, rows: table.rows }));
    if (tables.some((table) => !table.name)) throw new Error('SQL sample contains an unnamed input table.');
    const result = asciiTables(outputText)[0];
    if (!result) throw new Error('SQL source output table is missing.');
    const explanation = section.match(/\bExplanation\s*:\s*([\s\S]*)/i)?.[1]?.trim() || '';
    const expectedRows = result.rows.map((row) => row.map((value) => /^(?:null|none)$/i.test(value) ? null : /^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value) ? Number(value) : value));
    return { tables, columns: result.header, expectedRows, input: seedSql(schemas, tables), output: expectedRows.map((row) => row.map((value) => value ?? '').join('|')).join('\n'), explanation };
  });
  if (!samples.length) throw new Error('No source SQL examples found.');
  return { schemas, schemaSql, samples };
}
