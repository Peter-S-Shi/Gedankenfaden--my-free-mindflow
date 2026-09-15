import { describe, it, expect } from 'vitest';
import { sanitizeExportFilename } from '../export/saveExport';

describe('Export Closure EX-06: Unicode/CJK filename preservation', () => {
  it('preserves a pure Chinese title verbatim', () => {
    expect(sanitizeExportFilename('淞江球场')).toBe('淞江球场');
  });

  it('preserves a mixed Chinese/English title readably instead of collapsing into underscores', () => {
    expect(sanitizeExportFilename('淞江球场 Report')).toBe('淞江球场 Report');
  });

  it('replaces only genuinely Windows-invalid characters', () => {
    expect(sanitizeExportFilename('Report: Q1/Q2 "Draft"?')).toBe('Report_ Q1_Q2 _Draft__');
  });

  it('strips ASCII control characters', () => {
    expect(sanitizeExportFilename('Title\x00\x1fEnd')).toBe('TitleEnd');
  });

  it('falls back to a deterministic default for an empty title', () => {
    expect(sanitizeExportFilename('')).toBe('gedankenfaden_doc');
  });

  it('falls back to a deterministic default for a whitespace-only title', () => {
    expect(sanitizeExportFilename('   ')).toBe('gedankenfaden_doc');
  });

  it('trims trailing dots and spaces (Windows-invalid filename ending)', () => {
    expect(sanitizeExportFilename('Report...   ')).toBe('Report');
  });

  it('does not transliterate Chinese to ASCII', () => {
    const result = sanitizeExportFilename('淞江球场');
    expect(result).not.toMatch(/^[a-z0-9_-]+$/i);
  });
});
