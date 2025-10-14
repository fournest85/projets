const diff = require('diff');

/**
 * Compare deux textes ligne par ligne et retourne les différences.
 * @param {string} oldText - Ancienne version du texte.
 * @param {string} newText - Nouvelle version du texte.
 * @returns {Array} Liste des différences avec type ('added', 'removed') et contenu.
 */
function diffLines(oldText, newText) {
  const changes = diff.diffLines(oldText || '', newText || '');
  return changes
    .filter(part => part.added || part.removed)
    .map(part => ({
      type: part.added ? 'added' : 'removed',
      content: part.value
    }));
}

module.exports = { diffLines };