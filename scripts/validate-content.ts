import { validateContent } from './content';

const { checked, errors } = validateContent();

if (errors.length > 0) {
  for (const e of errors) console.error(`✗ ${e.file}: ${e.message}`);
  console.error(`\nContent validation failed: ${errors.length} error(s) in ${checked} file(s).`);
  process.exit(1);
}
console.log(`✓ ${checked} content file(s) valid.`);
