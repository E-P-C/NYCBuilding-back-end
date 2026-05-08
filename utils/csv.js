const parseCsvRows = (csvText) => {
  if (typeof csvText !== 'string') {
    throw 'csv import data must be a string';
  }

  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i += 1) {
    const char = csvText[i];
    const nextChar = csvText[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        field += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      row.push(field);
      field = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i += 1;
      }

      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      continue;
    }

    field += char;
  }

  if (inQuotes) {
    throw 'csv import data has an unterminated quoted field';
  }

  row.push(field);
  rows.push(row);

  return rows.filter((items) => items.some((item) => item.trim().length > 0));
};

export const parseCsvObjects = (csvText) => {
  const rows = parseCsvRows(csvText);

  if (rows.length < 2) {
    throw 'csv import data must include a header row and at least one building row';
  }

  const headers = rows[0].map((header) => header.trim());

  if (headers.some((header) => header.length === 0)) {
    throw 'csv import headers must not be empty';
  }

  if (new Set(headers).size !== headers.length) {
    throw 'csv import headers must be unique';
  }

  return rows.slice(1).map((row, rowIndex) => {
    if (row.length !== headers.length) {
      throw `csv row ${rowIndex + 2} must contain ${headers.length} value${headers.length === 1 ? '' : 's'}`;
    }

    const building = {};

    headers.forEach((header, index) => {
      const value = row[index].trim();

      if (value.length > 0) {
        building[header] = value;
      }
    });

    return building;
  });
};
