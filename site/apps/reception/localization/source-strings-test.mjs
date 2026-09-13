import assert from 'node:assert/strict';
import {stringSegments} from './source-strings.mjs';
const source="const re=/[«»\"'.,:;()]/g;const title='Пример';const html=`<p>${ok?'Да':'Нет'}</p>Продолжить`; // 'Комментарий'\nconst escape=/['`]/;";
assert.deepEqual(stringSegments(source).map(row=>row.text).sort(),['Пример','<p>','Да','Нет','</p>Продолжить'].sort());
assert.deepEqual(stringSegments("const text='Строка\\nНовая';").map(row=>row.text),['Строка\nНовая']);
assert.deepEqual(stringSegments("Object.assign(paths,{icon:'Подсказка',nested:{label:'Метка'}});").map(row=>row.text),['Подсказка','Метка'],'Object property values are authored strings, not primitive AST metadata');
console.log('PASS AST extraction: regex quotes, nested templates, comments and escapes');
