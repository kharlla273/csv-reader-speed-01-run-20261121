// Fast drop-in for csv-reader 1.0.0 (make.fun's own reference CSV reader).
//
// Returns exactly csv-reader 1.0.0's answer {columns, rows, errors} for every
// {text, header} input, but reads with indexOf/slice scanning instead of one
// character at a time. The reading policy, restated from the reference:
//
//   - a U+FEFF at the very start of the text is dropped;
//   - a record ends at LF or CRLF, and a line left with no characters is no record;
//   - outside quotes a CR not followed by LF is dropped (error stray_cr);
//   - a field that opens with a quote runs to the next quote that is not doubled,
//     "" inside it is one quote and each CRLF or lone CR inside it is read as LF;
//     what follows its closing quote, up to the next comma or line break, is
//     appended as it stands (quote_junk, when the field ends); a quote that never
//     closes is a literal character, and the text after it is read again as
//     unquoted (unterminated_quote);
//   - a quote inside an unquoted field is a literal character; fields stay strings;
//   - columns is the first record when header is true, else null; rows holds the
//     records after it, each padded (short_row, with fields: its field count) or
//     cut (long_row, with extra: the cut fields) to the first record's width;
//   - each error is {code, line, row}, in the order met; line is the 1-based line
//     its record starts on (every LF, CRLF and lone CR inside quotes counted),
//     row its record's index in rows, null for the header.
//
// Pure: no clock, no randomness, no locale, nothing kept from one call to the next.

/** How a field ended: 0 = comma, 1 = line break, 2 = end of text. */
const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  const n = text.length;
  let pos = 0; // the next character to read
  let line = 1; // the line that character is on
  if (n > 0 && text.charCodeAt(0) === 0xfeff) pos = 1;

  // The record being read: the line it starts on and the index in rows it takes.
  let recLine = 1;
  let recRow = null;

  // Position of the next CR at or after the last queried position, or Infinity.
  // Kept as a cursor: pos only moves forward, so every indexOf('\r') scan covers
  // a fresh stretch of text and the total CR scanning over a run is O(n).
  let crPos = -1;
  function nextCr(from) {
    if (crPos < from) {
      const i = text.indexOf('\r', from);
      crPos = i === -1 ? Infinity : i;
    }
    return crPos;
  }

  // Same cursor for the next LF.
  let nlPos = -1;
  function nextNl(from) {
    if (nlPos < from) {
      const i = text.indexOf('\n', from);
      nlPos = i === -1 ? Infinity : i;
    }
    return nlPos;
  }

  // Count line breaks (LF, CRLF and lone CR) in text[a, b). Only used for quoted
  // spans that hold a break, which are rare; the span itself is short.
  function countLines(a, b) {
    let c = 0;
    for (let i = a; i < b; i++) {
      const ch = text.charCodeAt(i);
      if (ch === 10) c++;
      else if (ch === 13 && text.charCodeAt(i + 1) !== 10) c++;
    }
    return c;
  }

  // Reads unquoted characters starting at `from`, onto `prefix`. Returns the
  // field and how it ended; `added` counts the characters kept after the prefix.
  // A CR not followed by LF is dropped (stray_cr) and the field goes on.
  function readUnquoted(from, prefix) {
    let value = prefix;
    let added = 0;
    let p = from;
    for (;;) {
      const comma = text.indexOf(',', p);
      const nl = nextNl(p);
      let end = -1;
      let kind = END;
      if (comma !== -1 && (nl === Infinity || comma < nl)) {
        end = comma;
        kind = COMMA;
      } else if (nl !== Infinity) {
        end = nl;
        kind = LINE_BREAK;
      }
      const cr = nextCr(p);
      if (cr !== Infinity && (end === -1 || cr < end)) {
        if (text.charCodeAt(cr + 1) === 10) {
          // CRLF: the record ends here (end is the LF just past this CR).
          if (cr > p) {
            value += text.slice(p, cr);
            added += cr - p;
          }
          pos = cr + 2;
          line += 1;
          return { value, ended: LINE_BREAK, added };
        }
        // A lone CR: dropped, error recorded, the field goes on past it.
        errors.push({ code: 'stray_cr', line: recLine, row: recRow });
        if (cr > p) {
          value += text.slice(p, cr);
          added += cr - p;
        }
        p = cr + 1;
        continue;
      }
      if (kind === COMMA) {
        if (end > p) {
          value += text.slice(p, end);
          added += end - p;
        }
        pos = end + 1;
        return { value, ended: COMMA, added };
      }
      if (kind === LINE_BREAK) {
        if (end > p) {
          value += text.slice(p, end);
          added += end - p;
        }
        pos = end + 1;
        line += 1;
        return { value, ended: LINE_BREAK, added };
      }
      if (p < n) {
        value += text.slice(p);
        added += n - p;
      }
      pos = n;
      return { value, ended: END, added };
    }
  }

  // Reads a quoted field whose opening quote is at pos.
  function readQuoted() {
    const open = pos;
    const openLine = line;
    let p = open + 1; // scan cursor for the closing quote
    let segStart = p; // start of the current raw segment
    let parts = null; // accumulated segments once a doubled quote is met
    let closedAt = -1;
    for (;;) {
      const q = text.indexOf('"', p);
      if (q === -1) break;
      if (text.charCodeAt(q + 1) === 34) {
        // A doubled quote: one quote in the value, the field goes on.
        if (parts === null) parts = [];
        parts.push(text.slice(segStart, q));
        parts.push('"');
        p = q + 2;
        segStart = p;
        continue;
      }
      closedAt = q;
      break;
    }
    if (closedAt === -1) {
      // The quote never closes: it is a literal character, and the text after it
      // is read again as unquoted.
      pos = open + 1;
      line = openLine;
      errors.push({ code: 'unterminated_quote', line: recLine, row: recRow });
      return readUnquoted(open + 1, '"');
    }
    // The quoted span is text[open + 1, closedAt).
    const firstNl = text.indexOf('\n', open + 1);
    const firstCr = nextCr(open + 1);
    const hasNl = firstNl !== -1 && firstNl < closedAt;
    const hasCr = firstCr !== Infinity && firstCr < closedAt;
    if (hasNl || hasCr) line += countLines(open + 1, closedAt);
    let value;
    if (parts === null) {
      value = hasCr
        ? text.slice(open + 1, closedAt).replace(/\r\n?/g, '\n')
        : text.slice(open + 1, closedAt);
    } else {
      parts.push(text.slice(segStart, closedAt));
      value = parts.join('');
      if (hasCr) value = value.replace(/\r\n?/g, '\n');
    }
    if (closedAt + 1 >= n) {
      pos = n;
      return { value, ended: END };
    }
    const c = text.charCodeAt(closedAt + 1);
    if (c === 44) {
      pos = closedAt + 2;
      return { value, ended: COMMA };
    }
    if (c === 10) {
      pos = closedAt + 2;
      line += 1;
      return { value, ended: LINE_BREAK };
    }
    if (c === 13 && text.charCodeAt(closedAt + 2) === 10) {
      pos = closedAt + 3;
      line += 1;
      return { value, ended: LINE_BREAK };
    }
    // What follows the closing quote is appended as it stands, up to the next
    // comma or line break. The quote_junk error is recorded after that read, so
    // any stray_cr inside the junk comes first in the errors, as the reference has it.
    const junk = readUnquoted(closedAt + 1, value);
    if (junk.added > 0) errors.push({ code: 'quote_junk', line: recLine, row: recRow });
    return junk;
  }

  for (;;) {
    // Lines with no characters are no records.
    while (pos < n) {
      if (text.charCodeAt(pos) === 10) {
        pos += 1;
        line += 1;
      } else if (text.charCodeAt(pos) === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= n) break;

    recLine = line;
    recRow = header && columns === null ? null : rows.length;

    // Fast path: the whole record sits on one physical line and holds no quote
    // and no CR, so its fields are the line split on commas. The line's content
    // ends before its LF (and before the CR of a CRLF); a quote or a CR inside
    // that span falls through to the field-by-field path below.
    const nl = nextNl(pos);
    const contentEnd = nl === Infinity ? n : text.charCodeAt(nl - 1) === 13 ? nl - 1 : nl;
    const q = text.indexOf('"', pos);
    const cr = nextCr(pos);
    let fields;
    let quoted = false;
    if ((q === -1 || q >= contentEnd) && (cr === Infinity || cr >= contentEnd)) {
      fields = text.slice(pos, contentEnd).split(',');
      if (nl !== Infinity) line += 1;
      pos = nl === Infinity ? n : nl + 1;
    } else {
      fields = [];
      let field;
      do {
        quoted = text.charCodeAt(pos) === 34;
        field = quoted ? readQuoted() : readUnquoted(pos, '');
        fields.push(field.value);
      } while (field.ended === COMMA);
    }

    // A line that held only stray CRs is left with no characters: no record
    // (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !quoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recLine, row: recRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recLine, row: recRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
