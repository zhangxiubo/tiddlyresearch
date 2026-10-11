"use strict";

const assert = require("node:assert/strict");

function group_by(items,key) {
	const groups = new Map();
	for(const item of items) {
		const value = key(item);
		groups.set(value,[...(groups.get(value) || []),item]);
	}
	return groups;
}

function find_cycles(edges) {
	const complete = new Set(), active = new Map(), path = [], cycles = [];
	function visit(title) {
		if(active.has(title)) {
			cycles.push(path.slice(active.get(title)).concat(title));
			return;
		}
		if(complete.has(title)) return;
		active.set(title,path.length);
		path.push(title);
		for(const child of edges.get(title) || []) visit(child);
		path.pop();
		active.delete(title);
		complete.add(title);
	}
	for(const title of edges.keys()) visit(title);
	return cycles;
}

function inspect_graph(tiddlers,parse_list) {
	const notes = tiddlers.filter(note => !note["draft.of"] && !note.title.startsWith("$:/"));
	const by_title = new Map(notes.map(note => [note.title,note]));
	assert.equal(by_title.size,notes.length,"Duplicate note titles in input");
	const children = new Map(notes.map(note => [note.title,parse_list(note["stream-list"] || "",true)]));
	const containers = new Map(notes.map(note => [note.title,[]]));
	const issues = {absent_from_parent:[],missing_parents:[],wrong_parents:[],missing_children:[],duplicate_children:[],multiple_containers:[]};
	for(const note of notes) {
		const seen = new Set();
		for(const child of children.get(note.title)) {
			const edge = {parent:note.title,child};
			if(seen.has(child)) issues.duplicate_children.push(edge);
			seen.add(child);
			if(!by_title.has(child)) {
				issues.missing_children.push(edge);
				continue;
			}
			containers.get(child).push(note.title);
			const claimed_parent = by_title.get(child).parent || null;
			if(claimed_parent !== note.title) issues.wrong_parents.push({...edge,claimed_parent});
		}
		if(note.parent) {
			const edge = {child:note.title,parent:note.parent};
			if(!by_title.has(note.parent)) issues.missing_parents.push(edge);
			else if(!children.get(note.parent).includes(note.title)) issues.absent_from_parent.push(edge);
		}
	}
	for(const [child,parents] of containers) {
		if(new Set(parents).size > 1) issues.multiple_containers.push({child,parents});
	}
	const parent_edges = new Map(notes.map(note => [note.title,note.parent ? [note.parent] : []]));
	issues.parent_cycles = find_cycles(parent_edges);
	issues.child_cycles = find_cycles(children);
	return {issues,counts:Object.fromEntries(Object.entries(issues).map(([name,items]) => [name,items.length])),children,containers,by_title};
}

function plan_repair(tiddlers,parse_list,stringify_list) {
	const graph = inspect_graph(tiddlers,parse_list);
	assert.equal(graph.counts.parent_cycles + graph.counts.child_cycles,0,"Review cycles before planning repairs");
	assert.equal(graph.counts.duplicate_children,0,"Review repeated list entries before planning repairs");
	const changes = [];
	for(const edge of graph.issues.wrong_parents) {
		const {child,parent,claimed_parent} = edge;
		// A unique visible owner one level below the old pointer supports a narrow repair.
		const unique_owner = graph.containers.get(child).length === 1;
		const parent_note = graph.by_title.get(parent);
		if(unique_owner && claimed_parent && parent_note.parent === claimed_parent) {
			changes.push({title:child,field:"parent",before:claimed_parent,after:parent,
				reason:"Match the unique visible owner; preserve the displayed outline and its ordering."});
		}
	}
	const missing_by_parent = group_by(graph.issues.missing_children,edge => edge.parent);
	for(const [parent,edges] of missing_by_parent) {
		const missing = new Set(edges.map(edge => edge.child));
		changes.push({title:parent,field:"stream-list",before:graph.by_title.get(parent)["stream-list"],
			after:stringify_list(graph.children.get(parent).filter(child => !missing.has(child))),
			reason:"Remove references to absent tiddlers; preserve the order of every existing child.",missing:[...missing]});
	}
	const plan = {version:1,before:graph.counts,changes};
	const repaired = apply_plan(tiddlers,plan);
	const after = inspect_graph(repaired,parse_list);
	plan.after = after.counts;
	plan.deferred = {
		unlisted:after.issues.absent_from_parent.map(edge => ({...edge,
			text:after.by_title.get(edge.child).text || "",
			reason:"The intended presence and sibling position are unknown. Retain without modification."})),
		references:after.issues.wrong_parents.map(edge => ({...edge,
			containers:after.containers.get(edge.child),
			reason:"May be a deliberate embedded or shared note. Do not silently change ownership."}))
	};
	return plan;
}

function apply_plan(tiddlers,plan,direction="forward") {
	assert(["forward","reverse"].includes(direction),"Unknown repair direction");
	const [source_field,target_field] = direction === "forward" ? ["before","after"] : ["after","before"];
	const by_title = new Map(tiddlers.map(note => [note.title,note]));
	assert.equal(by_title.size,tiddlers.length,"Duplicate titles in input");
	for(const change of plan.changes) {
		assert(by_title.has(change.title),"Missing repair target: " + change.title);
		assert.equal(by_title.get(change.title)[change.field],change[source_field],"Changed repair target: " + change.title);
	}
	const changes_by_title = group_by(plan.changes,change => change.title);
	return tiddlers.map(note => ({...note,...Object.fromEntries((changes_by_title.get(note.title) || [])
		.map(change => [change.field,change[target_field]]))}));
}

function compare_history(source,backup,parse_list) {
	const graph = inspect_graph(source,parse_list);
	const titles = new Set(["absent_from_parent","wrong_parents","missing_children","missing_parents"]
		.flatMap(name => graph.issues[name]).flatMap(edge => [edge.child,edge.parent,edge.claimed_parent]).filter(Boolean));
	const earlier = new Map(backup.map(note => [note.title,note]));
	const fields = ["parent","stream-list","stream-type","text"];
	const differences = [], absent_in_both = [];
	for(const title of titles) {
		const current = graph.by_title.get(title), previous = earlier.get(title);
		if(!current && !previous) absent_in_both.push(title);
		if(Boolean(current) !== Boolean(previous)) differences.push({title,field:"existence"});
		for(const field of fields) {
			if((current?.[field] || "") !== (previous?.[field] || "")) differences.push({title,field});
		}
	}
	return {affected_titles:titles.size,existing_titles:titles.size - absent_in_both.length,absent_in_both,differences,compared_fields:fields};
}

module.exports = {inspect_graph,plan_repair,apply_plan,compare_history};
