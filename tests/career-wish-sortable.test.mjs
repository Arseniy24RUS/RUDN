import test from 'node:test';
import assert from 'node:assert/strict';
import {moveWishId,wishTargetIndex} from '../site/apps/career/assets/wish-sortable.mjs';

test('moving third to first and back preserves the other employer priorities',()=>{
  const original=Object.freeze(['federal','regional','corporation']);
  const first=moveWishId(original,2,0);
  assert.deepEqual(first,['corporation','federal','regional']);
  assert.deepEqual(moveWishId(first,0,2),original);
  assert.deepEqual(original,['federal','regional','corporation']);
});

test('every allowed insertion keeps exactly the selected IDs without duplicates',()=>{
  for(const selected of [['one'],['one','two'],['one','two','three']]){
    for(let from=0;from<selected.length;from++)for(let to=0;to<selected.length;to++){
      const reordered=moveWishId(selected,from,to);
      assert.notEqual(reordered,selected);
      assert.equal(reordered[to],selected[from]);
      assert.deepEqual([...reordered].sort(),[...selected].sort());
      assert.deepEqual(reordered.filter(id=>id!==selected[from]),selected.filter(id=>id!==selected[from]));
    }
  }
});

test('invalid and empty target positions cannot add an unselected employer',()=>{
  for(const [from,to] of [[-1,0],[0,-1],[2,0],[0,2],[0,0.5],[NaN,0]])assert.throws(()=>moveWishId(['one','two'],from,to),RangeError);
  assert.throws(()=>moveWishId(['one','one'],0,1),TypeError);
  assert.throws(()=>moveWishId(['one','two','three','four'],0,1),TypeError);
  assert.throws(()=>moveWishId(['one',''],0,1),TypeError);
});

test('pointer targets use actual card heights and stay within filled slots',()=>{
  // Narrow-screen names make the rows different heights.
  const boxes=[{top:100,height:90},{top:200,height:160},{top:370,height:110}];
  assert.equal(wishTargetIndex(boxes,2,120),0);
  assert.equal(wishTargetIndex(boxes,2,230),1);
  assert.equal(wishTargetIndex(boxes,0,440),2);
  assert.equal(wishTargetIndex(boxes,0,10000),2);
  assert.equal(wishTargetIndex(boxes,2,-10000),0);
  // The third visible slot is empty and is deliberately absent from the input.
  assert.equal(wishTargetIndex(boxes.slice(0,2),0,10000),1);
});

test('the source card does not become a competing target while held',()=>{
  const boxes=[{top:0,height:100},{top:110,height:100},{top:220,height:100}];
  assert.equal(wishTargetIndex(boxes,1,112),1);
  assert.equal(wishTargetIndex(boxes,1,208),1);
  assert.equal(wishTargetIndex(boxes,1,40),0);
  assert.equal(wishTargetIndex(boxes,1,280),2);
});
