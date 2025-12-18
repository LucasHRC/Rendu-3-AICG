/**
 * Module de rendu Markdown avancé avec support GFM (tables, etc.)
 */

/**
 * Normalise les tables Markdown potentiellement cassées
 * @param {string} markdown - Texte Markdown brut
 * @returns {string} - Markdown avec tables corrigées
 */
export function normalizeMarkdownTables(markdown) {
  if (!markdown) return '';

  const lines = markdown.split('\n');
  const result = [];
  let inTable = false;
  let tableLines = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const hasTablePipe = line.includes('|') && line.trim().startsWith('|');

    if (hasTablePipe) {
      if (!inTable) {
        inTable = true;
        tableLines = [];
      }
      tableLines.push(line);
    } else {
      if (inTable) {
        // Fin de table, normaliser
        const normalizedTable = fixTable(tableLines);
        result.push(...normalizedTable);
        inTable = false;
        tableLines = [];
      }
      result.push(line);
    }
  }

  // Table en fin de document
  if (inTable && tableLines.length > 0) {
    const normalizedTable = fixTable(tableLines);
    result.push(...normalizedTable);
  }

  return result.join('\n');
}

/**
 * Corrige une table GFM
 */
function fixTable(lines) {
  if (lines.length < 2) {
    // Pas assez de lignes pour une table, convertir en liste
    return lines.map(l => `- ${l.replace(/\|/g, ' ').trim()}`);
  }

  // Vérifier si la ligne séparateur existe
  const hasSeparator = lines.some(l => /^\|[\s\-:]+\|/.test(l));

  if (hasSeparator) {
    return lines; // Table déjà valide
  }

  // Ajouter un séparateur après la première ligne (header)
  const result = [lines[0]];
  
  // Compter les colonnes
  const cols = (lines[0].match(/\|/g) || []).length - 1;
  const separator = '|' + Array(cols).fill('---').join('|') + '|';
  
  result.push(separator);
  result.push(...lines.slice(1));

  return result;
}

/**
 * Parse Markdown GFM complet en HTML
 * @param {string} text - Texte Markdown
 * @returns {string} - HTML
 */
export function parseMarkdown(text) {
  if (!text) return '';

  // 1. Normaliser les tables
  let markdown = normalizeMarkdownTables(text);

  // 2. Protéger les code blocks
  const codeBlocks = [];
  markdown = markdown.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
    codeBlocks.push({ lang, code });
    return `__CODE_BLOCK_${codeBlocks.length - 1}__`;
  });

  // 3. Parser les tables GFM
  markdown = parseGFMTables(markdown);

  // 4. Headers
  markdown = markdown.replace(/^#### (.+)$/gm, '<h4 class="font-semibold mt-2 mb-1 text-gray-800">$1</h4>');
  markdown = markdown.replace(/^### (.+)$/gm, '<h3 class="font-bold mt-3 mb-1 text-gray-900">$1</h3>');
  markdown = markdown.replace(/^## (.+)$/gm, '<h2 class="font-bold text-sm mt-4 mb-2 text-gray-900 border-b border-gray-200 pb-1">$1</h2>');
  markdown = markdown.replace(/^# (.+)$/gm, '<h1 class="font-bold text-base mt-4 mb-2 text-gray-900">$1</h1>');

  // 5. Bold & Italic
  markdown = markdown.replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold">$1</strong>');
  markdown = markdown.replace(/\*(.+?)\*/g, '<em>$1</em>');
  markdown = markdown.replace(/__(.+?)__/g, '<strong class="font-semibold">$1</strong>');
  markdown = markdown.replace(/_(.+?)_/g, '<em>$1</em>');

  // 6. Code inline
  markdown = markdown.replace(/`([^`]+)`/g, '<code class="px-1 py-0.5 bg-gray-200 text-gray-800 rounded text-xs font-mono">$1</code>');

  // 7. Listes
  markdown = markdown.replace(/^(\s*)- (.+)$/gm, '$1<li class="ml-4 list-disc">$2</li>');
  markdown = markdown.replace(/^(\s*)(\d+)\. (.+)$/gm, '$1<li class="ml-4 list-decimal">$3</li>');
  
  // Wrapper les listes
  markdown = markdown.replace(/(<li class="ml-4 list-disc">[\s\S]*?<\/li>)(?!\s*<li)/g, '<ul class="my-2">$1</ul>');
  markdown = markdown.replace(/(<li class="ml-4 list-decimal">[\s\S]*?<\/li>)(?!\s*<li)/g, '<ol class="my-2">$1</ol>');

  // 8. Citations [Source X] ou [DocX:ChunkY]
  markdown = markdown.replace(/\[Source (\d+)\]/g, '<span class="px-1 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-medium">[Source $1]</span>');
  markdown = markdown.replace(/\[Doc(\d+):Chunk(\d+)\]/g, '<span class="px-1 py-0.5 bg-purple-100 text-purple-700 rounded text-xs font-medium">[Doc$1:Chunk$2]</span>');

  // 9. Liens
  markdown = markdown.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-blue-600 underline hover:text-blue-800" target="_blank">$1</a>');

  // 10. Paragraphes
  markdown = markdown.replace(/\n\n+/g, '</p><p class="mt-2">');
  markdown = markdown.replace(/\n/g, '<br/>');

  // 11. Restaurer code blocks
  codeBlocks.forEach((block, i) => {
    const langClass = block.lang ? `language-${block.lang}` : '';
    markdown = markdown.replace(
      `__CODE_BLOCK_${i}__`,
      `<pre class="bg-gray-800 text-gray-100 p-3 rounded-lg my-2 overflow-x-auto text-xs ${langClass}"><code>${escapeHtml(block.code)}</code></pre>`
    );
  });

  return `<p>${markdown}</p>`;
}

/**
 * Parse les tables GFM en HTML
 */
function parseGFMTables(markdown) {
  const tableRegex = /(\|.+\|[\r\n]+\|[-:\s|]+\|[\r\n]+(?:\|.+\|[\r\n]*)+)/g;

  return markdown.replace(tableRegex, (tableBlock) => {
    const rows = tableBlock.trim().split('\n').filter(r => r.trim());
    if (rows.length < 2) return tableBlock;

    const headerRow = rows[0];
    const separatorRow = rows[1];
    const dataRows = rows.slice(2);

    // Parser alignement depuis separator
    const alignments = separatorRow.split('|').slice(1, -1).map(cell => {
      const trimmed = cell.trim();
      if (trimmed.startsWith(':') && trimmed.endsWith(':')) return 'center';
      if (trimmed.endsWith(':')) return 'right';
      return 'left';
    });

    // Parser header
    const headerCells = headerRow.split('|').slice(1, -1);
    const headerHTML = headerCells.map((cell, i) => {
      const align = alignments[i] || 'left';
      return `<th class="px-3 py-2 text-left font-semibold bg-gray-100 border-b border-gray-300 text-${align}">${cell.trim()}</th>`;
    }).join('');

    // Parser data rows
    const rowsHTML = dataRows.map((row, rowIdx) => {
      const cells = row.split('|').slice(1, -1);
      const cellsHTML = cells.map((cell, i) => {
        const align = alignments[i] || 'left';
        return `<td class="px-3 py-2 border-b border-gray-200 text-${align}">${cell.trim()}</td>`;
      }).join('');
      const bgClass = rowIdx % 2 === 1 ? 'bg-gray-50' : '';
      return `<tr class="${bgClass}">${cellsHTML}</tr>`;
    }).join('');

    return `
      <div class="overflow-x-auto my-3">
        <table class="min-w-full text-xs border border-gray-200 rounded-lg overflow-hidden">
          <thead><tr>${headerHTML}</tr></thead>
          <tbody>${rowsHTML}</tbody>
        </table>
      </div>
    `;
  });
}

/**
 * Escape HTML entities
 */
function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

