const test=require('node:test');
const assert=require('node:assert/strict');
const {streamSafeMarkdown}=require('../src/shared/streaming-markdown');
const cases=[
  [
    "**Testo",
    "Testo"
  ],
  [
    "```python\na*b\nprint(\"**\")",
    "```python\na*b\nprint(\"**\")"
  ],
  [
    "```js\nconst marker = \"*\";\n```\n\n**Risultato",
    "```js\nconst marker = \"*\";\n```\n\nRisultato"
  ]
];
test('incomplete prose markers never alter fenced program contents',()=>{for(const [input,expected] of cases)assert.equal(streamSafeMarkdown(input),expected);});
