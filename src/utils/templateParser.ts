export interface TextSegment {
  type: 'static' | 'variable';
  text: string;
  varName?: string;
  filled?: boolean;
}

/**
 * Extracts unique variable names enclosed in square brackets [變數名稱]
 * preserving the order of first appearance across issue and recommendation templates.
 */
export function extractVariables(...templates: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  const regex = /\[([^\[\]\n]+)\]/g;

  for (const tpl of templates) {
    if (!tpl) continue;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(tpl)) !== null) {
      const varName = match[1].trim();
      if (varName && !seen.has(varName)) {
        seen.add(varName);
        result.push(varName);
      }
    }
  }

  return result;
}

/**
 * Compiles a template string by replacing [變數名稱] with user-provided values.
 * If a variable is empty, keeps [變數名稱] so the engineer knows it's unfilled.
 */
export function compileTemplateText(
  template: string,
  values: Record<string, string>
): string {
  if (!template) return '';
  return template.replace(/\[([^\[\]\n]+)\]/g, (fullMatch, rawName) => {
    const name = rawName.trim();
    const val = values[name];
    return val !== undefined && val.trim() !== '' ? val.trim() : fullMatch;
  });
}

/**
 * Splits a template string into static and variable segments for rich live preview rendering.
 */
export function parseTemplateSegments(
  template: string,
  values: Record<string, string>
): TextSegment[] {
  if (!template) return [];
  const segments: TextSegment[] = [];
  const regex = /\[([^\[\]\n]+)\]/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(template)) !== null) {
    if (match.index > lastIndex) {
      segments.push({
        type: 'static',
        text: template.slice(lastIndex, match.index),
      });
    }
    const varName = match[1].trim();
    const val = values[varName];
    const isFilled = val !== undefined && val.trim() !== '';

    segments.push({
      type: 'variable',
      varName,
      text: isFilled ? val.trim() : `[${varName}]`,
      filled: isFilled,
    });

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < template.length) {
    segments.push({
      type: 'static',
      text: template.slice(lastIndex),
    });
  }

  return segments;
}
