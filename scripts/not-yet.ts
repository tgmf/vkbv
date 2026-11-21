// Placeholder for commands whose milestone has not been built yet.
const [command = '?', milestone = '?'] = process.argv.slice(2);
console.log(`npm run ${command}: not available until ${milestone}.`);
