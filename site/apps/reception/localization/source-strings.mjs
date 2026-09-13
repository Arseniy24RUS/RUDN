// Build-time syntax parsing: quotes inside regular expressions are not UI copy.
import {parse} from 'acorn';
export function stringSegments(source){
 const strings=[];
 const visit=node=>{
  if(!node||typeof node!=='object')return;
  if(node.type==='Literal'&&typeof node.value==='string')strings.push({text:node.value,start:node.start});
  else if(node.type==='TemplateElement')strings.push({text:node.value.cooked??node.value.raw,start:node.start});
  for(const [key,value]of Object.entries(node)){
   if(['start','end','loc','regex'].includes(key))continue;
   if(Array.isArray(value))value.forEach(visit);else if(value&&typeof value==='object')visit(value);
  }
 };
 visit(parse(source,{ecmaVersion:'latest',sourceType:'module'}));
 return strings;
}
