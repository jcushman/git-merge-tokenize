var DiffMatchPatch = require('diff-match-patch');
var TextOperation = require('ot/lib/text-operation');
var isInsert = TextOperation.isInsert, isDelete = TextOperation.isDelete, isRetain = TextOperation.isRetain;

function getDelta(t1, t2) {
  /* Compare two texts using diff-match-patch and return a TextOperation() to turn the first into the second. */
  var dmp = new DiffMatchPatch();
  dmp.Diff_Timeout = 0;
  var diffs = dmp.diff_main(t1, t2, false);
  var out = TextOperation();
  diffs.forEach(function (op) {
    if (op[0] == DiffMatchPatch.DIFF_DELETE)
      out.delete(op[1].length);
    else if (op[0] == DiffMatchPatch.DIFF_EQUAL)
      out.retain(op[1].length);
    else
      out.insert(op[1]);
  });
  return out;
}

var STANDARD_TOKENS = {
  CONFLICT_OURS: "<<<<<<<\n",
  CONFLICT_BASE: "\n|||||||\n",
  CONFLICT_THEIRS: "\n=======\n",
  CONFLICT_END: "\n>>>>>>>"
};

function tokensToChars(tokens, t2c, c2t){
  /*
    Given a set of tokens, return a character string with one unique character per token. Add new tokens to the
    t2c and c2t lookup dicts.
   */
  var out = '';
  var t2cIndex = Object.keys(t2c).length;

  function addToken(token) {
      var c = String.fromCharCode(t2cIndex++);
      t2c[token] = c;
      c2t[c] = token;
  }

  // Add standard tokens to the lookup tables.
  if(t2cIndex == 0) {
    for (var key of Object.keys(STANDARD_TOKENS)) {
      addToken(STANDARD_TOKENS[key]);
    }
  }

  tokens.forEach(function(token){
    if(!t2c.hasOwnProperty(token))
      addToken(token);
    out += t2c[token];
  });
  return out;
}

function charsToTokens(chars, c2t){
  /* Convert character string back to real tokens. */
  var out = '';
  for(var c of chars){
    out += c2t[c];
  }
  return out;
}

function addOp(transform, op){
  /* Add a single op in changeOp format to a TextOperation. */
  if(isRetain(op))
    transform.retain(op);
  else {
    if (op[0])
      transform.delete(op[0]);
    if (op[1])
      transform.insert(op[1]);
  }
}

function addOps(transform, ops){
  /* Add group of ops in changeOp format to a TextOperation. */
  for(var op of ops)
    addOp(transform, op);
}

function render(text, cursor, ops){
  /*
    Given a text, an offset cursor within the text, and a set of operations in changeOp format,
    return the result of applying those operations at that point in the text.
   */
  var out = "";
  for(var op of ops){
    if(isRetain(op)) {
      out += text.substr(cursor, cursor + op);
      cursor += op;
    }else{ // insert/delete
      if(op[0])
        cursor += op[0];
      if(op[1])
        out += op[1];
    }
  }
  return out;
}

function textOperationToChangeOps(textOps){
  /* Convert a TextOperation to an array of changeOps. */
  var out = [];
  var lastOp = null;
  for(var op of textOps.ops){
    if(isRetain(op)){
      if(lastOp) {
        out.push(lastOp);
        lastOp = null;
      }
      out.push(op);
    }else{
      if(lastOp === null)
        lastOp = [0, ''];
      if(isDelete(op))
        lastOp[0] -= op;
      else
        lastOp[1] += op;
    }
  }
  if(lastOp)
    out.push(lastOp);
  return out;
}

function mergeTexts(ancestor, current, other, tokenizer){
  /*
    Merge current and other texts into ancestor.

    Conflicts will be marked in the returned text using <<<<<<< current ||||||| ancestor ======= other >>>>>>> format.

    If tokenizer function is provided, texts will be split using tokenizer. Otherwise, comparison is at character level.
   */
  var t2c = {}, c2t = {};
  if(tokenizer){
    ancestor = tokensToChars(tokenizer(ancestor), t2c, c2t);
    current = tokensToChars(tokenizer(current), t2c, c2t);
    other = tokensToChars(tokenizer(other), t2c, c2t);
  }

  var our_delta = getDelta(ancestor, current);
  var their_delta = getDelta(ancestor, other);

  var ops1 = textOperationToChangeOps(our_delta), ops2 = textOperationToChangeOps(their_delta);
  var merged = TextOperation();
  var cursor = 0;
  var conflicts = false;

  // helpers

  function conflict(ours, base, theirs){
    /* Add a conflict report to `merged`. */
    conflicts = true;
    merged.insert(t2c[STANDARD_TOKENS.CONFLICT_OURS]+ours+t2c[STANDARD_TOKENS.CONFLICT_BASE]+base+t2c[STANDARD_TOKENS.CONFLICT_THEIRS]+theirs+t2c[STANDARD_TOKENS.CONFLICT_END]);
  }

  function opLen(op){
    return isRetain(op) ? op : op[0];
  }

  function consume(ops, len){
    /*
      Remove ops from `ops` and return them, until `len` characters have been consumed.
      If only part of the final op is consumed, split it.
     */
    var out = [];
    while(len){
      if(!ops.length)
        throw new Error("Ran out of ops to consume");
      var ol = opLen(ops[0]);
      if(ol <= len) {
        out.push(ops.shift());
        len -= ol;
      }else {
        if(isRetain(ops[0])){
          newOp = len;
          ops[0] -= newOp;
        }else{
          newOp = [len, ops[0][1]];
          ops[0][0] -= len;
          ops[0][1] = '';
        }
        out.push(newOp);
        len = 0;
      }
    }
    return out;
  }

  var conflictLen, deleted;

  while(ops1.length || ops2.length){
    // one list empty
    if(!ops1.length){
      addOps(merged, ops2);
      break;
    }
    if(!ops2.length){
      addOps(merged, ops1);
      break;
    }

    var op1 = ops1[0], op2 = ops2[0];
    var ol1 = opLen(op1), ol2 = opLen(op2);

    // at least one op is retain
    if (isRetain(op1)) {
      addOps(merged, consume(ops2, ol1));
      ops1.shift();
      cursor += ol1;
    }
    else if (isRetain(op2)) {
      addOps(merged, consume(ops1, ol2));
      ops2.shift();
      cursor += ol2;
    }

    // ops are equal
    else if(op1[0]==op2[0] && op1[1]==op2[1]){
      addOp(merged, op1);
      ops1.shift();
      ops2.shift();
      cursor += ol1;
    }

    // conflict
    else{
      conflictLen = Math.max(ol1, ol2);

      if(conflictLen == 0){
        // two inserts
        conflict(op1[1], '', op2[1]);
        ops1.shift();
        ops2.shift();
      }else {
        // at least one delete
        deleted = ancestor.substr(cursor, conflictLen);
        var op1text = render(ancestor, cursor, consume(ops1, conflictLen));
        var op2text = render(ancestor, cursor, consume(ops2, conflictLen));
        conflict(op1text, deleted, op2text);
        merged.delete(conflictLen);
        cursor += conflictLen;
      }
    }
  }

  ancestor = merged.apply(ancestor);

  if(tokenizer)
    ancestor = charsToTokens(ancestor, c2t);

  return [ancestor, conflicts];
}

module.exports['mergeTexts'] = mergeTexts;
