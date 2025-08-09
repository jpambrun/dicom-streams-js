module.exports = {
    require: ['ts-node/register', 'source-map-support/register'],
    recursive: true,
    spec: ['test/*-test.ts'],
    watchFiles: ['src/**/*.ts', 'test/**/*.ts'],
};
