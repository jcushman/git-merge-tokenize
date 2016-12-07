#!/usr/bin/env node
var fs = require("fs");

var merge = require('../merge');
var tokenizers = require('../tokenizers');

tokenizers = {
  'chars': null,
  'words': tokenizers.tokenizeWords
};

var argv = require('yargs')
  .alias('t', 'tokenizer')
  .alias('o', 'out-file')
  .describe('t', 'Tokenizers')
  .describe('o', 'Output file (default stdout)')
  .choices('t', Object.keys(tokenizers))
  .default({t: 'chars'})
  .help('help')
  .demand(3, 3, "Three files are required for merge: ancestor merge1 merge2")
  .argv;

// get tokenizer
var tokenizer = tokenizers[argv.tokenizer];

// open files
var ancestor = fs.readFileSync(argv._[0], 'utf8');
var current = fs.readFileSync(argv._[1], 'utf8');
var other = fs.readFileSync(argv._[2], 'utf8');

var _ = merge.mergeTexts(ancestor, current, other, tokenizer),
  result = _[0], conflicts = _[1];

// output
if(argv.o)
  fs.writeFileSync(argv.o, result, 'utf8');
else
  console.log(result);

process.exit(conflicts ? 1 : 0);
