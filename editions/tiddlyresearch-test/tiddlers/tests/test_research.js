/*\
title: $:/tiddlyresearch/tests/research.js
type: application/javascript
tags: $:/tags/test-spec
\*/
(function(){
"use strict";

describe("Streams research integration",function() {
	var wiki,
		structure = require("$:/plugins/sq/streams/draft_structure.js"),
		prefix = "$:/plugins/sq/streams/";
	function render(template,title) {
		return wiki.renderText("text/html","text/vnd.tiddlywiki",
			"\\import [all[shadows+tiddlers]tag[$:/tags/Macro]]\n{{||" + template + "}}",
			{variables: {currentTiddler: title,storyTiddler: title}});
	}
	beforeEach(function() {
		wiki = new $tw.Wiki();
		wiki.addTiddlers($tw.wiki.filterTiddlers("[all[shadows+tiddlers]is[system]]").map(function(title) {
			return $tw.wiki.getTiddler(title);
		}));
		wiki.addTiddlers([
			{title: "Research Root",text: "", "stream-type": "default","stream-list": "[[Research Parent]]"},
			{title: "Research Parent",text: "A parent paragraph",parent: "Research Root","stream-type": "default","stream-list": "[[Research Child]]"},
			{title: "Research Child",text: "A child paragraph",parent: "Research Parent","stream-type": "default"}
		]);
	});

	it("returns ancestors in reading order without the current node",function() {
		expect(wiki.filterTiddlers("[[Research Child]stream_ancestors[]]"))
			.toEqual(["Research Root","Research Parent"]);
	});
	it("terminates a damaged parent cycle without repeating the current node",function() {
		wiki.setText("Research Root","parent",null,"Research Child");
		expect(wiki.filterTiddlers("[[Research Child]stream_ancestors[]]"))
			.toEqual(["Research Root","Research Parent"]);
	});
	it("keeps the available breadcrumb path when an ancestor is missing",function() {
		wiki.deleteTiddler("Research Root");
		expect(wiki.filterTiddlers("[[Research Child]stream_ancestors[]]"))
			.toEqual(["Research Parent"]);
	});
	it("renders breadcrumb links through template transclusions",function() {
		var html = render(prefix + "breadcrumbs-view-template","Research Child");
		expect(html).toContain('href="#Research%20Root"');
		expect(html).toContain("A parent paragraph");
		expect(html).not.toContain('href="#Research%20Child"');
	});
	it("uses publication labels without rendering the publication body",function() {
		wiki.addTiddler(new $tw.Tiddler(wiki.getTiddler("Research Root"),{
			tags: "#publication","publication.title": "Published title",text: "Private body"
		}));
		var html = render(prefix + "templates/breadcrumbs","Research Child");
		expect(html).toContain("Published title");
		expect(html).not.toContain("Private body");
	});
	it("uses the title for empty or non-paragraph ancestor content",function() {
		wiki.setText("Research Parent","text",null,"! Heading");
		var html = render(prefix + "templates/breadcrumbs","Research Child");
		expect(html).toContain("Research Root");
		expect(html).toContain("Research Parent");
		expect(html).not.toContain("Heading");
	});
	it("keeps linked references editable through the shared node renderer",function() {
		wiki.addTiddler({title: "Research Target",text: "Target"});
		wiki.setText("Research Parent","text",null,"Reference to [[Research Target]]");
		var html = render("$:/plugins/xiubo/research/templates/linked_references","Research Target");
		expect(html).toContain("Linked References");
		expect(html).toContain('data-node-title="Research Parent"');
		expect(html).toContain("A child paragraph");
		expect(html).toContain('href="#Research%20Root"');
	});
	it("adds both linked markers and tags to node highlighting",function() {
		wiki.addTiddler(new $tw.Tiddler(wiki.getTiddler("Research Child"),{
			text: "Marked [[#highlight]]",tags: "todo"
		}));
		var html = render(prefix + "nodes-list-template","Research Parent");
		expect(html).toContain('data-node-tags="#highlight, #todo"');
	});
	it("counts real backlinks without counting open drafts",function() {
		wiki.addTiddlers([
			{title: "Research Reference",text: "[[Research Child]]"},
			{title: "Draft reference",text: "[[Research Child]]","draft.of": "Research Reference"}
		]);
		expect(render("$:/plugins/xiubo/research/templates/reference_count","Research Child"))
			.toContain('sq-backref-count">1</span>');
	});
	it("preserves custom editor selection while rendering the original node's children",function() {
		wiki.addTiddlers([
			{title: "$:/test/editor_rule",tags: "$:/tags/EditTemplateBodyFilter","list-before": "",text: "[all[current]then[$:/test/editor]]"},
			{title: "$:/test/editor",text: "Selected editor"},
			{title: "Research Draft","draft.of": "Research Root","draft.title": "Research Root",text: "Draft body"}
		]);
		expect(render("$:/core/ui/EditTemplate/body","Research Draft")).toContain("Selected editor");
		expect(render(prefix + "templates/edit_view","Research Draft")).toContain("A parent paragraph");
	});
	it("captures draft structure through the actual navigator extension",function() {
		var widget = wiki.makeWidget(wiki.parseText("text/vnd.tiddlywiki","<$navigator/>"),{document: $tw.fakeDocument}),
			container = $tw.fakeDocument.createElement("div");
		widget.render(container,null);
		function find_navigator(node) {
			return node.parseTreeNode.type === "navigator" ? node : node.children.map(find_navigator).find(Boolean);
		}
		var draft = find_navigator(widget).makeDraftTiddler("Research Root");
		expect(JSON.parse(draft.fields["draft.streams"])["stream-list"]).toBe("[[Research Parent]]");
	});
	it("preserves child changes made while the parent draft is open",function() {
		var draft = structure.capture(new $tw.Tiddler(wiki.getTiddler("Research Root"),{
			title: "Research Draft","draft.of": "Research Root",text: "Edited parent"
		}));
		wiki.setText("Research Root","stream-list",null,"[[Research Parent]] [[New child]]");
		var saved = structure.merge(wiki,new $tw.Tiddler(draft,{title: "Research Root"}),draft);
		expect(saved.fields["stream-list"]).toBe("[[Research Parent]] [[New child]]");
		expect(saved.fields.text).toBe("Edited parent");
		expect(saved.hasField("draft.streams")).toBe(false);
	});
	it("keeps an explicit structure edit made in the draft",function() {
		var draft = structure.capture(new $tw.Tiddler(wiki.getTiddler("Research Root"),{
			title: "Research Draft","draft.of": "Research Root"
		}));
		draft = new $tw.Tiddler(draft,{"stream-list": "[[Manual child]]"});
		expect(structure.merge(wiki,draft,draft).fields["stream-list"]).toBe("[[Manual child]]");
	});
	it("preserves a concurrent move and removal of the last child",function() {
		var draft = structure.capture(new $tw.Tiddler(wiki.getTiddler("Research Parent"),{
			title: "Research Draft","draft.of": "Research Parent"
		}));
		wiki.addTiddler(new $tw.Tiddler(wiki.getTiddler("Research Parent"),{parent: "Other Root","stream-list": undefined}));
		var saved = structure.merge(wiki,draft,draft);
		expect(saved.fields.parent).toBe("Other Root");
		expect(saved.hasField("stream-list")).toBe(false);
	});
	it("relinks node relationships and research fields together",function() {
		wiki.addTiddler({title: "Research Metadata",text: "[[Research Root]]",topics: "[[Research Root]]","publication.authors": "[[Research Root]]"});
		wiki.renameTiddler("Research Root","Research Renamed");
		expect(wiki.getTiddler("Research Parent").fields.parent).toBe("Research Renamed");
		expect(wiki.getTiddler("Research Metadata").fields.topics).toBe("[[Research Renamed]]");
		expect(wiki.getTiddler("Research Metadata").fields["publication.authors"]).toBe("[[Research Renamed]]");
	});
	it("renders author and topic reverse references",function() {
		wiki.addTiddlers([
			{title: "Research Author",tags: "Author"},
			{title: "Research Paper",tags: "#publication","publication.title": "Paper title","publication.authors": "[[Research Author]]",topics: "[[Research Topic]]"},
			{title: "Research Topic"}
		]);
		expect(render("$:/plugins/xiubo/research/templates/author","Research Author")).toContain("Paper title");
		expect(render("$:/plugins/xiubo/research/templates/topics","Research Topic")).toContain("Research Paper");
	});
});
})();
