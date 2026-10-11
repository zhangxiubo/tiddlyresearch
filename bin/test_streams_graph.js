"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {inspect_graph,plan_repair,apply_plan,compare_history} = require("./streams_graph");
const {utils} = require("../boot/boot.js").TiddlyWiki();
const inspect = notes => inspect_graph(notes,utils.parseStringArray);
const plan = notes => plan_repair(notes,utils.parseStringArray,utils.stringifyList);
const fixture = () => [
	{title:"Root","stream-list":"Parent",text:"Root text"},
	{title:"Parent",parent:"Root","stream-list":"[[Child note]] Missing",text:"Parent text"},
	{title:"Child note",parent:"Root",text:"Keep all note content",tags:"Research"},
	{title:"Unlisted",parent:"Root",text:"Unfinished"}
];

test("corrects a unique visible owner without relocating the outline",() => {
	const source = fixture(), changes = plan(source), result = apply_plan(source,changes);
	assert.equal(result.find(note => note.title === "Child note").parent,"Parent");
	assert.deepEqual(inspect(result).children.get("Parent"),["Child note"]);
	assert.equal(inspect(result).counts.absent_from_parent,1);
});
test("preserves every field outside the explicit plan and supports exact rollback",() => {
	const source = fixture(), snapshot = JSON.stringify(source), changes = plan(source);
	const result = apply_plan(source,changes);
	assert.deepEqual(apply_plan(result,changes,"reverse"),source);
	assert.equal(JSON.stringify(source),snapshot);
	for(const original of source) {
		const allowed = new Set(changes.changes.filter(change => change.title === original.title).map(change => change.field));
		const changed = result.find(note => note.title === original.title);
		for(const [field,value] of Object.entries(original)) if(!allowed.has(field)) assert.deepEqual(changed[field],value);
	}
});
test("a repaired input needs no second repair",() => {
	const source = fixture(), result = apply_plan(source,plan(source));
	assert.deepEqual(plan(result).changes,[]);
});
test("refuses changed targets before applying a saved plan",() => {
	const source = fixture(), changes = plan(source);
	source.find(note => note.title === "Child note").parent = "Someone else";
	assert.throws(() => apply_plan(source,changes),/Changed repair target/);
});
test("keeps multiple visible owners and standalone references for review",() => {
	const source = fixture().concat([{title:"Second parent","stream-list":"[[Child note]] Concept"},{title:"Concept",text:"A standalone definition"}]);
	const changes = plan(source);
	assert.equal(changes.changes.filter(change => change.field === "parent").length,0);
	assert.equal(changes.deferred.references.length,3);
	assert.equal(inspect(source).counts.multiple_containers,1);
});
test("does not guess ownership for unrelated conflicting parents",() => {
	const source = fixture();
	source.find(note => note.title === "Child note").parent = "Unlisted";
	assert.equal(plan(source).changes.filter(change => change.field === "parent").length,0);
});
test("detects repeated child entries before the parser can remove them",() => {
	const source = [{title:"Root","stream-list":"Child Child"},{title:"Child",parent:"Root"}];
	assert.equal(inspect(source).counts.duplicate_children,1);
	assert.throws(() => plan(source),/repeated list entries/);
});
test("checks cycles in both relationship directions",() => {
	const source = [{title:"A",parent:"B","stream-list":"B"},{title:"B",parent:"A","stream-list":"A"}];
	assert.equal(inspect(source).counts.parent_cycles,1);
	assert.equal(inspect(source).counts.child_cycles,1);
	assert.throws(() => plan(source),/cycles/);
});
test("ignores draft copies and system configuration in the note graph",() => {
	const source = fixture().concat([{title:"Draft","draft.of":"Parent",parent:"Missing"},{title:"$:/config/demo",parent:"Missing"}]);
	assert.equal(inspect(source).counts.missing_parents,0);
});
test("history comparison distinguishes absent titles from preserved existing notes",() => {
	const source = fixture(), history = compare_history(source,source,utils.parseStringArray);
	assert.deepEqual(history.absent_in_both,["Missing"]);
	assert.equal(history.existing_titles,4);
	assert.deepEqual(history.differences,[]);
	const changed = source.map(note => note.title === "Child note" ? {...note,text:"Earlier text"} : note);
	assert.deepEqual(compare_history(source,changed,utils.parseStringArray).differences,[{title:"Child note",field:"text"}]);
});
