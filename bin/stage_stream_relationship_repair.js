"use strict";

// Create a fresh local trial: node bin/stage_stream_relationship_repair.js RUNTIME SOURCE_WIKI NEW_WIKI [BACKUP_EXPORT]
// Recheck a trial: node bin/stage_stream_relationship_repair.js RUNTIME --verify TRIAL_WIKI
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const {isDeepStrictEqual} = require("node:util");
const {inspect_graph,plan_repair,apply_plan,compare_history} = require("./streams_graph");
const {review_tiddler} = require("./streams_graph_review");
const [runtime,source_arg,target_arg,backup_export] = process.argv.slice(2);
assert(runtime && source_arg && target_arg,"Expected runtime, source wiki (or --verify), and target wiki");
const target = path.resolve(target_arg);
const tw = require(path.resolve(runtime,"boot/boot.js")).TiddlyWiki();
tw.boot.argv = [path.resolve(__dirname,"../editions/tiddlyresearch-test")];

function read_notes(directory) {
	return tw.loadTiddlersFromPath(path.join(directory,"tiddlers"))
		.flatMap(file => file.tiddlers).map(fields => ({...new tw.Tiddler(fields).getFieldStrings()}));
}

function assert_equal(actual,expected,message) {
	assert(isDeepStrictEqual(actual,expected),message);
}

function write_json(filename,value) {
	fs.writeFileSync(filename,JSON.stringify(value,null,2) + "\n",{flag:"wx"});
}

function verify(directory) {
	const archive = path.join(directory,"relationship_repair");
	const before = JSON.parse(fs.readFileSync(path.join(archive,"before.json")));
	const plan = JSON.parse(fs.readFileSync(path.join(archive,"plan.json")));
	const expected = apply_plan(before,plan);
	const current = read_notes(directory);
	const by_title = new Map(current.map(note => [note.title,note]));
	assert.equal(by_title.size,current.length,"Duplicate titles in trial");
	const presentation = new Set(["$:/SiteTitle","$:/SiteSubtitle","$:/DefaultTiddlers","$:/StoryList"]);
	let checked = 0;
	for(const note of expected) {
		if(presentation.has(note.title)) continue;
		const actual = by_title.get(note.title);
		assert(actual,"Missing source tiddler: " + note.title);
		const stable_fields = fields => Object.fromEntries(Object.entries(fields).filter(([field]) =>
			!(note.title === "Today" && ["event.date","modified"].includes(field))));
		assert_equal(stable_fields(actual),stable_fields(note),"Unexpected source change: " + note.title);
		checked++;
	}
	const graph = inspect_graph(current,tw.utils.parseStringArray);
	const original_graph = inspect_graph(before,tw.utils.parseStringArray);
	for(const [parent,children] of original_graph.children) {
		assert_equal(graph.children.get(parent),children.filter(child => original_graph.by_title.has(child)),
			"Visible child order changed: " + parent);
	}
	assert_equal(graph.counts,plan.after,"Graph changed after the repair");
	assert_equal(apply_plan(expected,plan,"reverse"),before,"Repair does not reverse exactly");
	assert_equal(plan_repair(expected,tw.utils.parseStringArray,tw.utils.stringifyList).changes,[],"Repair is not stable on repeat");
	const restored = new Map(current.map(note => [note.title,note]));
	for(const fields of tw.loadTiddlersFromFile(path.join(archive,"reverse-import.json")).tiddlers) {
		const note = {...new tw.Tiddler(fields).getFieldStrings()};
		restored.set(note.title,note);
		assert_equal(note,before.find(original => original.title === note.title),"Reverse import changed a source tiddler");
	}
	assert_equal(inspect_graph([...restored.values()],tw.utils.parseStringArray).counts,plan.before,"Reverse import did not restore the original graph");
	return {original_tiddlers_verified:checked,changed_tiddlers:new Set(plan.changes.map(change => change.title)).size,
		before:plan.before,after:graph.counts,all_source_text_preserved:true,visible_child_order_preserved:true,
		exact_reverse_verified:true,reverse_import_verified:true,repeat_repair_changes:0};
}

tw.boot.boot(() => {
	if(source_arg === "--verify") {
		console.log(JSON.stringify(verify(target),null,2));
		process.exit(0);
	}
	const source = path.resolve(source_arg);
	assert(fs.existsSync(path.join(source,"migration/source.json")),"Source must be an archived local upgrade copy");
	assert(!fs.existsSync(target),"Target must be a new directory");
	const before = read_notes(source);
	const plan = plan_repair(before,tw.utils.parseStringArray,tw.utils.stringifyList);
	if(backup_export) plan.history = compare_history(before,JSON.parse(fs.readFileSync(backup_export)),tw.utils.parseStringArray);
	const repaired = apply_plan(before,plan);
	assert_equal(apply_plan(repaired,plan,"reverse"),before,"Repair must reverse exactly before staging");
	assert(!before.some(note => note.title === "Streams Relationship Review"),"Review title already exists");
	const presentation = {
		"$:/SiteTitle":"Relationship repair — local trial",
		"$:/SiteSubtitle":"Local test copy. No changes sync to Google Drive.",
		"$:/DefaultTiddlers":"[[Streams Relationship Review]]"
	};
	const notes = repaired.filter(note => !Object.hasOwn(presentation,note.title))
		.concat(Object.entries(presentation).map(([title,text]) => ({title,text})),review_tiddler(plan));
	fs.mkdirSync(target,{recursive:true,mode:0o700});
	fs.copyFileSync(path.join(source,"tiddlywiki.info"),path.join(target,"tiddlywiki.info"));
	fs.cpSync(path.join(source,"plugins"),path.join(target,"plugins"),{recursive:true});
	fs.cpSync(path.join(source,"migration"),path.join(target,"migration"),{recursive:true});
	fs.mkdirSync(path.join(target,"tiddlers"));
	notes.forEach((note,index) => write_json(path.join(target,"tiddlers",String(index).padStart(5,"0") + ".json"),note));
	const archive = path.join(target,"relationship_repair");
	fs.mkdirSync(archive,{mode:0o700});
	write_json(path.join(archive,"before.json"),before);
	write_json(path.join(archive,"plan.json"),plan);
	const changed = new Set(plan.changes.map(change => change.title));
	write_json(path.join(archive,"reverse-import.json"),before.filter(note => changed.has(note.title)));
	const result = verify(target);
	write_json(path.join(archive,"verification.json"),result);
	console.log(JSON.stringify({wiki:target,...result},null,2));
	process.exit(0);
});
