import fs from 'fs/promises';
import path from 'path';

const data = await fs.readFile('./package.json', 'utf-8');

const json = JSON.parse(data);

const { name, version, description, exports, license } = json;

const newPackage = { name, version, description, license };

let newExports = {};
for (const [key, value] of Object.entries(exports)) {
    const defaultPath = value.replace(/^\.\/src\//, './').replace(/\.ts$/, '.mjs');
    newExports[key] = {
        'default': defaultPath,
        'types': './' + path.join(path.dirname(defaultPath), path.basename(defaultPath, path.extname(defaultPath)) + '.d.ts')
    };
}

fs.writeFile('./dist/package.json', JSON.stringify({ ...newPackage, exports: newExports }, null, 2), 'utf-8');


