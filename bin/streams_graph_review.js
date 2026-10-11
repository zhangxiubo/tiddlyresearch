"use strict";

function review_tiddler(plan) {
	const attribute = value => String(value).replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
	// Dynamic links keep this administrative report out of note backlink panels.
	const link = title => `<$let repair_target="${attribute(title)}"><$link to=<<repair_target>>><$text text=<<repair_target>>/></$link></$let>`;
	const counts = [
		["Children absent from their stated parent's list","absent_from_parent"],
		["Listed children with a different or absent parent field","wrong_parents"],
		["Listed children whose tiddlers are absent","missing_children"]
	];
	const changed_parents = plan.changes.filter(change => change.field === "parent");
	const missing_lists = plan.changes.filter(change => change.field === "stream-list");
	const empty_count = plan.deferred.unlisted.filter(item => !item.text.trim()).length;
	const without_parent = plan.deferred.references.filter(item => !item.claimed_parent).length;
	const shared = plan.deferred.references.filter(item => item.containers.length > 1).length;
	const history = plan.history;
	return {title:"Streams Relationship Review",type:"text/vnd.tiddlywiki",text:[
		"! Local repair trial",
		"The live installation has not been changed. All original note bodies are retained. Relationship edits are archived in this copy's relationship_repair directory, together with the source snapshot and a reverse import file.",
		["|Issue|Before|After|h",...counts.map(([label,key]) => "|" + [label,plan.before[key],plan.after[key]].join("|") + "|")].join("\n"),
		"These are relationship checks, not counts of distinct notes: a wrong parent pointer can fail two checks.",
		"!! What the evidence establishes",
		history ? `${history.existing_titles} existing affected tiddlers were compared with the supplied backup; ${history.absent_in_both.length} referenced titles are absent from both snapshots. The comparison found ${history.differences.length} changes in content or relationship fields. Snapshots alone do not identify the edit that caused each problem.` : "The source snapshot and every applied change are archived. Visible ownership provides the repair evidence; historical intent remains unknown.",
		"Streams records each relationship twice: in the parent's ordered stream-list and in the child's parent field. Rendering uses the list; traversal and editing also use the parent field. A saved draft can restore old structural fields over changes made elsewhere. Automated tests reproduce wrong pointers, detached new nodes and links to deleted nodes with protection disabled, and prevent them with the fork's draft protection enabled. This is a demonstrated cause, not proof of every historical incident.",
		"Investigation also reproduced a separate merge bug: merging a node transferred its children without updating their parent pointers. The local fork now updates those pointers before removing the merged node. Reproducing a bug does not establish it as the historical cause of a particular note's damage.",
		"Interrupted saves, imports, deliberate embedding or manual edits remain possible explanations for individual cases. The snapshots contain no per-edit history that distinguishes them.",
		"!! Applied: parent pointers",
		"Each child has one visible owner, immediately below its old stated parent. Only the parent field changes. The displayed ordering stays the same.",
		...changed_parents.map(change => "* " + link(change.title) + " → " + link(change.after)),
		"!! Applied: absent child references",
		"Only absent titles are removed from these lists. Their names remain in the archive. This repair does not recover their content.",
		...missing_lists.map(change => "* " + link(change.title) + ": " + change.missing.map(link).join(", ")),
		"!! Retained for review: unlisted notes",
		`These ${plan.deferred.unlisted.length} notes include ${empty_count} empty bodies and ${plan.deferred.unlisted.length - empty_count} nonempty bodies. Their original parent pointers are kept. No sibling order is invented and no notes are deleted. Empty marker tiddlers may still be referenced elsewhere.`,
		...plan.deferred.unlisted.map(item => "* " + link(item.child) + " — stated parent: " + link(item.parent) + (item.text.trim() ? ` — fragment: <$text text="${attribute(item.text.trim())}"/>` : " — empty body")),
		"!! Retained for review: embedded or shared notes",
		`${without_parent} notes have no parent pointer; ${shared} are displayed by multiple parents. Decide whether these are owned child nodes or reusable references before changing their ownership. An explicit transclusion node is an option for reusable references.`,
		...plan.deferred.references.map(item => "* " + link(item.child) + " — displayed under: " + item.containers.map(link).join(", ") + " — stated parent: " + (item.claimed_parent ? link(item.claimed_parent) : "none")),
		"!! Next decision",
		"Review the corrected outlines and the retained cases here. The local trial is reversible. Publish the tested fork and take a fresh live snapshot before considering a separate live migration."
	].join("\n\n")};
}

module.exports = {review_tiddler};
