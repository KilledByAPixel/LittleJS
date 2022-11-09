import fs from 'fs'; // node

const files = [
	{ engine: './engine/engine.all.js', output: './engine/engine.all.module.js' },
	{ engine: './engine/engine.all.release.js', output: './engine/engine.all.release.module.js' },
];

const footerFile = fs.readFileSync('./engine/engine-esm-footer.js');

files.forEach(({ engine, output }) => {
	const engineFile = fs.readFileSync(engine);
	const file = [engineFile, footerFile].join('\n');
	fs.writeFileSync(output, file);
});
