/** Small verification reporter, ported from bio-brain. */
export function checker(title) {
  const rows = [];
  console.log(`\n${title}`);
  return {
    check(name, ok, detail = '') {
      rows.push(!!ok);
      console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` (${detail})` : ''}`);
      return !!ok;
    },
    done() {
      console.log(`${rows.filter(Boolean).length}/${rows.length} checks passed`);
      return rows.every(Boolean);
    },
  };
}
